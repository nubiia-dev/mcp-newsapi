import fetch, { RequestInit } from 'node-fetch';

/**
 * NewsAPI.ai is the commercial brand of the Event Registry API. Every
 * endpoint lives under `https://eventregistry.org/api/v1/...` and authenticates
 * with an `apiKey` request parameter (there is no auth header).
 */
const DEFAULT_HOST = 'https://eventregistry.org';

/** A JSON-serialisable request body. `undefined` values are dropped before sending. */
export type RequestBody = Record<string, unknown>;

export class NewsApiClient {
  private apiKey: string;
  private host: string;
  private maxRetries = 3;
  private backoffDelays = [1000, 2000, 4000]; // milliseconds
  /** 429 = too many simultaneous requests (Event Registry allows at most 5 in flight). */
  private retryableStatusCodes = new Set([429, 502, 503, 504]);

  constructor(apiKey: string, host: string = DEFAULT_HOST) {
    if (!apiKey) {
      throw new Error(
        'NewsAPI.ai API key not configured. Set NEWSAPI_AI_API_KEY with the key from ' +
          'https://newsapi.ai → Dashboard → API key. A free plan with a limited token budget ' +
          'is available.'
      );
    }
    this.apiKey = apiKey;
    this.host = host.replace(/\/+$/, '');
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
   */
  async post<T>(endpoint: string, body: RequestBody = {}): Promise<T> {
    const payload: RequestBody = { ...body, apiKey: this.apiKey };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined || payload[key] === null) delete payload[key];
    }

    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    };
    const url = this.buildUrl(endpoint);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const isLastAttempt = attempt === this.maxRetries - 1;
      try {
        const response = await fetch(url, options);

        if (!response.ok) {
          const errorText = this.redact(this.truncateErrorText(await response.text()));
          if (this.retryableStatusCodes.has(response.status) && !isLastAttempt) {
            lastError = new Error(`NewsAPI.ai API error (${response.status}): ${errorText}`);
            await this.sleep(this.backoffDelays[attempt]);
            continue;
          }
          if (response.status === 401 || response.status === 403) {
            throw new Error(this.authErrorMessage(response.status, errorText));
          }
          throw new Error(`NewsAPI.ai API error (${response.status}): ${errorText}`);
        }

        const text = await response.text();
        if (!text) {
          return {} as T;
        }
        const parsed = JSON.parse(text) as unknown;
        // Event Registry reports some failures as HTTP 200 + {"error": "..."}.
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          typeof (parsed as Record<string, unknown>).error === 'string'
        ) {
          throw new Error(
            `NewsAPI.ai API error: ${this.redact(this.truncateErrorText((parsed as { error: string }).error))}`
          );
        }
        return parsed as T;
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
          // Network-level failures (no HTTP status) are retried too.
          const isApiError = error.message.startsWith('NewsAPI.ai API error');
          if (!isApiError && !isLastAttempt && !(error instanceof SyntaxError)) {
            await this.sleep(this.backoffDelays[attempt]);
            continue;
          }
        }
        throw error;
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}
