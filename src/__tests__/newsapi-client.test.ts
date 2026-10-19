import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

import fetch from 'node-fetch';
import { NewsApiClient } from '../newsapi-client.js';
import { TokenBudget } from '../utils/token-budget.js';

const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

function res(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

describe('NewsApiClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a clear error when constructed without an API key', () => {
    expect(() => new NewsApiClient('')).toThrow(/API key not configured/);
    expect(() => new NewsApiClient('')).toThrow(/NEWSAPI_AI_API_KEY/);
  });

  it('POSTs JSON with the apiKey in the body, never in the URL', async () => {
    fetchMock.mockResolvedValue(res(200, '{"ok":true}'));
    const client = new NewsApiClient('secret-key');

    const result = await client.post('/api/v1/usage', { a: 1, skipped: undefined });

    expect(result).toEqual({ ok: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://eventregistry.org/api/v1/usage');
    expect(url).not.toContain('secret-key');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ a: 1, apiKey: 'secret-key' });
  });

  it('returns an empty object for an empty response body', async () => {
    fetchMock.mockResolvedValue(res(200, ''));
    const client = new NewsApiClient('k');
    expect(await client.post('/x')).toEqual({});
  });

  it('produces an actionable message on 401 mentioning the env var and usage tool', async () => {
    fetchMock.mockResolvedValue(res(401, 'bad key'));
    const client = new NewsApiClient('k');

    await expect(client.post('/x')).rejects.toThrow(/NEWSAPI_AI_API_KEY/);
    await expect(client.post('/x')).rejects.toThrow(/get_usage/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 401 is not retried
  });

  it('surfaces an {"error": ...} body returned with HTTP 200', async () => {
    fetchMock.mockResolvedValue(res(200, '{"error":"Invalid query"}'));
    const client = new NewsApiClient('k');
    await expect(client.post('/x')).rejects.toThrow(/Invalid query/);
  });

  it('retries 429 with backoff and then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(res(429, 'busy')).mockResolvedValueOnce(res(200, '{"ok":1}'));
    const client = new NewsApiClient('k');
    vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    expect(await client.post('/x')).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after max retries on persistent 503', async () => {
    fetchMock.mockResolvedValue(res(503, 'down'));
    const client = new NewsApiClient('k');
    vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    await expect(client.post('/x')).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 400', async () => {
    fetchMock.mockResolvedValue(res(400, 'bad request'));
    const client = new NewsApiClient('k');
    await expect(client.post('/x')).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redacts the API key from error text', async () => {
    fetchMock.mockResolvedValue(res(400, 'echo of secret-key in body'));
    const client = new NewsApiClient('secret-key');
    await expect(client.post('/x')).rejects.toThrow(/\[REDACTED\]/);
    await expect(client.post('/x')).rejects.not.toThrow(/secret-key/);
  });

  it('truncates error bodies to 500 characters', () => {
    const client = new NewsApiClient('k');
    const truncated = (client as any).truncateErrorText('x'.repeat(1000));
    expect(truncated.endsWith('… [truncated]')).toBe(true);
    expect((client as any).truncateErrorText('short')).toBe('short');
  });

  describe('error hygiene', () => {
    it('redacts a key that straddles the 500-character truncation boundary', async () => {
      // The key starts at char 495 of the body, so truncating first would leave a 5-char fragment.
      fetchMock.mockResolvedValue(
        res(400, 'x'.repeat(495) + 'secret-key-abcdef' + 'y'.repeat(100))
      );
      const client = new NewsApiClient('secret-key-abcdef');

      const err = await client.post('/x').catch((e: Error) => e);

      expect((err as Error).message).not.toContain('secret-key-abcdef');
      expect((err as Error).message).not.toContain('secret-k');
      expect((err as Error).message).toContain('[REDA'); // redacted, then truncated
    });

    it('redacts the key from a 200 {"error"} body', async () => {
      fetchMock.mockResolvedValue(res(200, JSON.stringify({ error: 'bad apiKey secret-key-1' })));
      const client = new NewsApiClient('secret-key-1');

      const err = await client.post('/x').catch((e: Error) => e);

      expect((err as Error).message).toContain('bad apiKey [REDACTED]');
      expect((err as Error).message).not.toContain('secret-key-1');
    });

    it('redacts the key from network error messages', async () => {
      fetchMock.mockRejectedValue(new Error('request to https://h/?apiKey=secret-key-2 failed'));
      const client = new NewsApiClient('secret-key-2');

      const err = await client.post('/x').catch((e: Error) => e);

      expect((err as Error).message).toMatch(/^NewsAPI.ai request failed:/);
      expect((err as Error).message).not.toContain('secret-key-2');
    });

    it('redacts the key from JSON parse errors', async () => {
      fetchMock.mockResolvedValue(res(200, 'not json secret-key-3'));
      const client = new NewsApiClient('secret-key-3');

      const err = await client.post('/x').catch((e: Error) => e);

      expect((err as Error).message).toMatch(/invalid JSON/);
      expect((err as Error).message).not.toContain('secret-key-3');
    });
  });

  describe('retry policy and timeout', () => {
    it('aborts after the timeout and does NOT retry (the request may have been billed)', async () => {
      fetchMock.mockImplementation(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            );
          })
      );
      const client = new NewsApiClient('k', { timeoutMs: 20 });

      await expect(client.post('/x')).rejects.toThrow(/timed out.*get_usage/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a pre-connection error such as ECONNREFUSED', async () => {
      fetchMock
        .mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
        .mockResolvedValueOnce(res(200, '{"ok":1}'));
      const client = new NewsApiClient('k');
      vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      expect(await client.post('/x')).toEqual({ ok: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry an ambiguous failure such as ECONNRESET', async () => {
      fetchMock.mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
      const client = new NewsApiClient('k');
      vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

      await expect(client.post('/x')).rejects.toThrow(/request failed/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('session budget', () => {
    it('charges the measured cost before sending and blocks when exhausted', async () => {
      fetchMock.mockResolvedValue(res(200, '{"ok":1}'));
      const budget = new TokenBudget(12);
      const client = new NewsApiClient('k', { budget });

      await client.post('/api/v1/trends/getTrendingConcepts'); // 10
      expect(budget.remainingTokens).toBe(2);

      await expect(client.post('/api/v1/event/getEvents')).rejects.toThrow(
        /budget exceeded.*only 2 of 12 remain.*NEWSAPI_AI_MAX_TOKENS_PER_SESSION/s
      );
      expect(fetchMock).toHaveBeenCalledTimes(1); // the blocked call never hit the API
    });

    it('does not charge free endpoints', async () => {
      fetchMock.mockResolvedValue(res(200, '[]'));
      const budget = new TokenBudget(0);
      const client = new NewsApiClient('k', { budget });

      await client.post('/api/v1/suggestConceptsFast');
      await client.post('/api/v1/usage');
      expect(budget.spentTokens).toBe(0);
    });

    it('refunds a call the API rejected with a 4xx, but not a 200 {"error"} (billed)', async () => {
      const budget = new TokenBudget(20);
      const client = new NewsApiClient('k', { budget });

      fetchMock.mockResolvedValueOnce(res(400, 'bad'));
      await expect(client.post('/api/v1/event/getEvents')).rejects.toThrow(/400/);
      expect(budget.spentTokens).toBe(0);

      fetchMock.mockResolvedValueOnce(res(200, '{"error":"not computed"}'));
      await expect(client.post('/api/v1/trends/getTrendingConcepts')).rejects.toThrow(
        /not computed/
      );
      expect(budget.spentTokens).toBe(10);
    });
  });
});
