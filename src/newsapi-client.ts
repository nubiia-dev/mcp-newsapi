import fetch, { RequestInit } from 'node-fetch';

import { TokenBudget, tokenCost } from './utils/token-budget.js';

/**
 * NewsAPI.ai is the commercial brand of the Event Registry API. Every
 * endpoint lives under `https://eventregistry.org/api/v1/...` and authenticates
 * with an `apiKey` request parameter (there is no auth header).
 */
const DEFAULT_HOST = 'https://eventregistry.org';

/** Per-attempt network timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** A JSON-serialisable request body. `undefined` values are dropped before sending. */
export type RequestBody = Record<string, unknown>;

export interface NewsApiClientOptions {
  host?: string;
  /** Session token budget; charged before each metered call. Unlimited when omitted. */
  budget?: TokenBudget;
  timeoutMs?: number;
}

/**
 * Socket-level errors that happen BEFORE a request reaches the server, so
 * retrying cannot double-spend tokens. Anything else (reset mid-flight,
 * timeout, ...) is ambiguous on a metered POST and is not retried.
 */
const SAFE_TO_RETRY_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

/** Marks errors thrown by this client so the retry loop can tell them from raw fetch failures. */
class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export class NewsApiClient {
  private apiKey: string;
  private host: string;
  private budget?: TokenBudget;
  private timeoutMs: number;
  private maxRetries = 3;
  private backoffDelays = [1000, 2000, 4000]; // milliseconds
  /** 429 = too many simultaneous requests (Event Registry allows at most 5 in flight). */
  private retryableStatusCodes = new Set([429, 502, 503, 504]);

  constructor(apiKey: string, options: NewsApiClientOptions = {}) {
    if (!apiKey) {
      throw new Error(
        'NewsAPI.ai API key not configured. Set NEWSAPI_AI_API_KEY with the key from ' +
          'https://newsapi.ai → Dashboard → API key. A free plan with a limited token budget ' +
          'is available.'
      );
    }
    this.apiKey = apiKey;
    this.host = (options.host ?? DEFAULT_HOST).replace(/\/+$/, '');
    this.budget = options.budget;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** The session budget, if one is configured (exposed for `get_usage`). */
  get sessionBudget(): TokenBudget | undefined {
    return this.budget;
  }

  private buildUrl(endpoint: string): string {
    return `${this.host}${endpoint}`;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Truncate error body to 500 chars to avoid huge error messages. */
  private truncateErrorText(text: string): string {
    return text.length > 500 ? text.slice(0, 500) + '… [truncated]' : text;
  }

  /** Removes the API key from any text that is about to be surfaced to the caller. */
  private redact(text: string): string {
    return this.apiKey ? text.split(this.apiKey).join('[REDACTED]') : text;
  }

  /**
   * Makes untrusted text safe to surface: redacts the key FIRST and truncates
   * afterwards, so a key that straddles the truncation boundary is never cut
   * into an unrecognisable (and unredactable) fragment.
   */
  private sanitize(text: string): string {
    return this.truncateErrorText(this.redact(text));
  }

  /**
   * Builds an actionable message for auth / budget failures.
   *
   * A bare "Unauthorized" is not enough: the usual causes are a wrong or
   * revoked key, or an account that has used up its token budget (Event
   * Registry answers 401/403 for both). `get_usage` shows the remaining budget.
   */
  private authErrorMessage(status: number, body: string): string {
    return (
      `NewsAPI.ai API error (${status}): ${body} — this usually means the API key is ` +
      `invalid/revoked, or the account has no tokens left. Verify NEWSAPI_AI_API_KEY at ` +
      `https://newsapi.ai (Dashboard) and call get_usage to check the remaining token budget.`
    );
  }

  /**
   * POSTs a JSON body to an Event Registry endpoint. The API key is injected
   * into the body (never the URL) so it cannot leak into proxy/access logs.
   *
   * Metered calls are charged against the session budget before being sent
   * and refunded when the API definitely rejected them (4xx other than 429).
   * Retries are limited to 429/502/503/504 and pre-connection socket errors:
   * an ambiguous failure (timeout, reset) is NOT retried because the request
   * may already have been processed and billed.
   */
  async post<T>(endpoint: string, body: RequestBody = {}): Promise<T> {
    const payload: RequestBody = { ...body, apiKey: this.apiKey };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined || payload[key] === null) delete payload[key];
    }

    const cost = tokenCost(endpoint, body);
    this.budget?.charge(cost);

    try {
      return await this.send<T>(endpoint, payload);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        this.budget?.refund(cost);
      }
      throw error;
    }
  }

  private async send<T>(endpoint: string, payload: RequestBody): Promise<T> {
    const url = this.buildUrl(endpoint);
    const bodyText = JSON.stringify(payload);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const isLastAttempt = attempt === this.maxRetries - 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const options: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: bodyText,
        signal: controller.signal as RequestInit['signal'],
      };

      try {
        const response = await fetch(url, options);

        if (!response.ok) {
          const errorText = this.sanitize(await response.text());
          if (this.retryableStatusCodes.has(response.status) && !isLastAttempt) {
            lastError = new ApiError(
              `NewsAPI.ai API error (${response.status}): ${errorText}`,
              response.status
            );
            await this.sleep(this.backoffDelays[attempt]);
            continue;
          }
          if (response.status === 401 || response.status === 403) {
            throw new ApiError(this.authErrorMessage(response.status, errorText), response.status);
          }
          throw new ApiError(
            `NewsAPI.ai API error (${response.status}): ${errorText}`,
            response.status
          );
        }

        const text = await response.text();
        if (!text) {
          return {} as T;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (parseError) {
          throw new ApiError(
            `NewsAPI.ai returned an invalid JSON response: ${this.sanitize(
              parseError instanceof Error ? parseError.message : String(parseError)
            )}`
          );
        }
        // Event Registry reports some failures as HTTP 200 + {"error": "..."}.
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          typeof (parsed as Record<string, unknown>).error === 'string'
        ) {
          throw new ApiError(
            `NewsAPI.ai API error: ${this.sanitize((parsed as { error: string }).error)}`
          );
        }
        return parsed as T;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        const err = error as NodeJS.ErrnoException & { name?: string };
        if (err?.name === 'AbortError') {
          throw new ApiError(
            `NewsAPI.ai request timed out after ${Math.round(this.timeoutMs / 1000)}s. It was ` +
              `not retried because it may still have been processed and billed — call get_usage ` +
              `to check your token balance.`
          );
        }
        const code = err?.code;
        if (code && SAFE_TO_RETRY_NETWORK_CODES.has(code) && !isLastAttempt) {
          lastError = err;
          await this.sleep(this.backoffDelays[attempt]);
          continue;
        }
        throw new ApiError(
          `NewsAPI.ai request failed: ${this.sanitize(err?.message ?? String(error))}`
        );
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}
