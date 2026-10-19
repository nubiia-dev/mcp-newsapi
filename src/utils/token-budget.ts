/**
 * Session token budget.
 *
 * NewsAPI.ai bills tokens per call (measured on a live free-plan account, see
 * docs/api-notes.md). A runaway agent loop can burn a monthly allowance in
 * minutes, so every metered call is charged against a per-session budget
 * BEFORE it is sent; once the budget is gone further calls fail locally with a
 * clear message and never reach the API.
 *
 * "Session" = the lifetime of the MCP server process.
 */

export const DEFAULT_MAX_TOKENS_PER_SESSION = 200;

/** Environment variable that overrides the default budget. */
export const BUDGET_ENV_VAR = 'NEWSAPI_AI_MAX_TOKENS_PER_SESSION';

/**
 * Parses the budget from an env var value. Empty / unset → default. Anything
 * that is not a non-negative integer also falls back to the default, with a
 * warning, so a typo can never silently disable the guard.
 */
export function parseBudgetEnv(raw: string | undefined): {
  value: number;
  warning?: string;
} {
  if (raw === undefined || raw.trim() === '') {
    return { value: DEFAULT_MAX_TOKENS_PER_SESSION };
  }
  if (!/^\d+$/.test(raw.trim())) {
    return {
      value: DEFAULT_MAX_TOKENS_PER_SESSION,
      warning:
        `${BUDGET_ENV_VAR}="${raw}" is not a non-negative integer; ` +
        `using the default of ${DEFAULT_MAX_TOKENS_PER_SESSION}.`,
    };
  }
  return { value: parseInt(raw.trim(), 10) };
}

/**
 * Measured token cost of a call, derived from the endpoint (and the result
 * type for `getEvent`, whose `articles` view is cheaper than `info`).
 * Unknown endpoints are charged 1 token so new endpoints are never free by
 * accident.
 */
export function tokenCost(endpoint: string, body: Record<string, unknown> = {}): number {
  switch (endpoint) {
    case '/api/v1/article/getArticles':
    case '/api/v1/article/getArticle':
      return 1;
    case '/api/v1/event/getEvents':
      return 5;
    case '/api/v1/event/getEvent':
      return body.resultType === 'articles' ? 1 : 5;
    case '/api/v1/trends/getTrendingConcepts':
      return 10;
    case '/api/v1/usage':
    case '/api/v1/suggestConceptsFast':
    case '/api/v1/suggestCategoriesFast':
    case '/api/v1/suggestSourcesFast':
    case '/api/v1/suggestLocationsFast':
      return 0;
    default:
      return 1;
  }
}

export class TokenBudget {
  private spent = 0;

  constructor(readonly max: number = DEFAULT_MAX_TOKENS_PER_SESSION) {}

  get spentTokens(): number {
    return this.spent;
  }

  get remainingTokens(): number {
    return Math.max(this.max - this.spent, 0);
  }

  /**
   * Reserves `cost` tokens, or throws a descriptive error (without spending
   * anything) when the session budget cannot cover it.
   */
  charge(cost: number): void {
    if (cost > this.remainingTokens) {
      throw new Error(
        `Session token budget exceeded: this call costs ${cost} token(s) but only ` +
          `${this.remainingTokens} of ${this.max} remain (${this.spent} spent this session). ` +
          `No request was sent to NewsAPI.ai. To allow more, raise ${BUDGET_ENV_VAR} in the MCP ` +
          `server's env configuration and restart the server.`
      );
    }
    this.spent += cost;
  }

  /** Gives back tokens reserved for a call that was definitely rejected before being processed. */
  refund(cost: number): void {
    this.spent = Math.max(this.spent - cost, 0);
  }
}
