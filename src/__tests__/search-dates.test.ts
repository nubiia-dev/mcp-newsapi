import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getArticleTools } from '../tools/articles.js';
import { getEventTools } from '../tools/events.js';
import { parseIsoDate } from '../validation.js';

/** "Today" is pinned so the 31-day and 1-year rules are deterministic. */
const NOW = '2026-10-19T12:00:00Z';

describe('date and archive rules (search_articles / search_events)', () => {
  let client: ReturnType<typeof createMockClient>;
  let articles: ReturnType<typeof getArticleTools>;
  let events: ReturnType<typeof getEventTools>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    client = createMockClient();
    articles = getArticleTools(client);
    events = getEventTools(client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseIsoDate', () => {
    it('accepts real dates and rejects impossible ones', () => {
      expect(parseIsoDate('2026-10-19')).toBeTypeOf('number');
      expect(parseIsoDate('2024-02-29')).toBeTypeOf('number');
      expect(parseIsoDate('2026-13-45')).toBeUndefined();
      expect(parseIsoDate('2026-02-30')).toBeUndefined();
      expect(parseIsoDate('2026-1-5')).toBeUndefined();
      expect(parseIsoDate('2026-10-19T00:00:00Z')).toBeUndefined();
    });
  });

  it('rejects a syntactically valid but impossible date', async () => {
    await expect(
      articles.search_articles.handler({ keyword: 'x', date_start: '2026-13-45' })
    ).rejects.toThrow(/real date/);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('rejects date_end before date_start', async () => {
    await expect(
      articles.search_articles.handler({
        keyword: 'x',
        date_start: '2026-10-15',
        date_end: '2026-10-10',
      })
    ).rejects.toThrow(/date_end must be on or after date_start/);
  });

  it('accepts a recent range without allow_archive', async () => {
    await articles.search_articles.handler({
      keyword: 'x',
      date_start: '2026-09-25',
      date_end: '2026-10-19',
    });
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('rejects an old date_start without allow_archive and explains the flag', async () => {
    await expect(
      articles.search_articles.handler({ keyword: 'x', date_start: '2026-01-01' })
    ).rejects.toThrow(/older than 31 days.*allow_archive=true/);
    await expect(
      events.search_events.handler({ keyword: 'x', date_start: '2026-01-01' })
    ).rejects.toThrow(/allow_archive=true/);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('rejects an old date_end without allow_archive (it would silently return nothing)', async () => {
    await expect(
      articles.search_articles.handler({ keyword: 'x', date_end: '2026-01-01' })
    ).rejects.toThrow(/date_end 2026-01-01 is older than 31 days/);
  });

  it('requires date_start when allow_archive is true', async () => {
    await expect(
      articles.search_articles.handler({ keyword: 'x', allow_archive: true })
    ).rejects.toThrow(/allow_archive=true requires date_start/);
    await expect(
      events.search_events.handler({ keyword: 'x', allow_archive: true })
    ).rejects.toThrow(/requires date_start/);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('rejects an archive span longer than 1 year', async () => {
    await expect(
      articles.search_articles.handler({
        keyword: 'x',
        allow_archive: true,
        date_start: '2024-01-01',
        date_end: '2025-06-01',
      })
    ).rejects.toThrow(/longer than 1 year/);
  });

  it('measures an open-ended archive span against today', async () => {
    await expect(
      articles.search_articles.handler({
        keyword: 'x',
        allow_archive: true,
        date_start: '2025-01-01', // → today (2026-10-19) is ~1.8 years
      })
    ).rejects.toThrow(/2025-01-01 → today is longer than 1 year/);
  });

  it('accepts an archive range of exactly one year and omits the 31-day clamp', async () => {
    await articles.search_articles.handler({
      keyword: 'x',
      allow_archive: true,
      date_start: '2025-03-01',
      date_end: '2026-03-01',
    });
    const [, body] = (client.post as any).mock.calls[0];
    expect(body.forceMaxDataTimeWindow).toBeUndefined();
    expect(body.dateStart).toBe('2025-03-01');
  });

  it('accepts archive with a start inside the last year and no end', async () => {
    await events.search_events.handler({
      keyword: 'x',
      allow_archive: true,
      date_start: '2025-10-19',
    });
    expect(client.post).toHaveBeenCalledTimes(1);
  });
});
