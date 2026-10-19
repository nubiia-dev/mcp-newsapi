import { NewsApiClient } from '../newsapi-client.js';
import { normalizeUsage } from '../domain/normalize.js';
import { getUsageSchema, withValidation } from '../validation.js';

/**
 * NewsAPI.ai is metered in tokens, not requests: a search consumes tokens and
 * an exhausted budget makes every later search fail. Check this before a
 * batch of searches, not just after something fails.
 */
export function getAccountTools(client: NewsApiClient) {
  return {
    get_usage: {
      description:
        'Get the token budget of this NewsAPI.ai account: tokens available, used and remaining ' +
        'for the current period. Call it before a batch of searches (measured costs: ' +
        'search_articles and get_article 1 token, search_events and get_event info 5, ' +
        'get_trending_concepts 10). Free: does not consume tokens itself. ' +
        'Suggest tools are free too. Also reports this server\u2019s session budget ' +
        '(NEWSAPI_AI_MAX_TOKENS_PER_SESSION, default 200): calls that would exceed it fail ' +
        'locally without reaching the API.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(getUsageSchema, async () => {
        const raw = await client.post('/api/v1/usage');
        const session = client.sessionBudget;
        return {
          ...normalizeUsage(raw),
          // Local per-process guard (NEWSAPI_AI_MAX_TOKENS_PER_SESSION), separate from the account balance.
          ...(session
            ? {
                session: {
                  maxTokens: session.max,
                  spentTokens: session.spentTokens,
                  remainingTokens: session.remainingTokens,
                },
              }
            : {}),
        };
      }),
    },
  };
}
