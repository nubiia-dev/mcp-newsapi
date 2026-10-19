import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

import fetch from 'node-fetch';
import { NewsApiClient } from '../newsapi-client.js';
import { TokenBudget } from '../utils/token-budget.js';
import { getArticleTools } from '../tools/articles.js';
import { getTrendTools } from '../tools/trends.js';
import { getAccountTools } from '../tools/account.js';

const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
const res = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

describe('tools through the HTTP client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('search_articles surfaces an HTTP 200 {"error"} body as a tool error', async () => {
    fetchMock.mockResolvedValue(res(200, '{"error":"Invalid conceptUri"}'));
    const tools = getArticleTools(new NewsApiClient('k'));

    await expect(tools.search_articles.handler({ keyword: 'x' })).rejects.toThrow(
      /Invalid conceptUri/
    );
  });

  it('exhausting the session budget blocks paid tools but not free ones', async () => {
    fetchMock.mockResolvedValue(res(200, '{"availableTokens":2000,"usedTokens":0}'));
    const budget = new TokenBudget(10);
    const client = new NewsApiClient('k', { budget });
    const trends = getTrendTools(client);
    const articles = getArticleTools(client);
    const account = getAccountTools(client);

    await trends.get_trending_concepts.handler({}); // 10 tokens: budget now empty
    await expect(articles.search_articles.handler({ keyword: 'x' })).rejects.toThrow(
      /Session token budget exceeded.*only 0 of 10 remain/s
    );
    // free tools still work, and report the local session budget
    const usage = (await account.get_usage.handler({})) as { session: Record<string, number> };
    expect(usage.session).toEqual({ maxTokens: 10, spentTokens: 10, remainingTokens: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // trends + usage; the blocked search never sent
  });
});
