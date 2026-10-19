import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

import fetch from 'node-fetch';
import { NewsApiClient } from '../newsapi-client.js';

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
});
