import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getArticleTools } from '../tools/articles.js';

const wireArticle = {
  uri: '123',
  lang: 'eng',
  isDuplicate: false,
  dateTime: '2026-10-19T10:00:00Z',
  dateTimePub: '2026-10-19T09:59:00Z',
  url: 'https://example.com/a',
  title: 'Telefónica posts results',
  body: 'x'.repeat(500),
  source: { uri: 'example.com', title: 'Example', dataType: 'news' },
  authors: [{ uri: 'a@x', name: 'Jane Doe', isAgency: false }],
  image: 'https://example.com/i.png',
  eventUri: 'eng-1',
  sentiment: 0.4,
  concepts: [{ uri: 'c', label: { eng: 'C' } }],
};

describe('Article Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getArticleTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getArticleTools(client);
  });

  describe('search_articles', () => {
    it('sends a recent-window, deduplicated, small query by default', async () => {
      (client.post as any).mockResolvedValue({
        articles: { results: [wireArticle], totalResults: 42, page: 1, pages: 5 },
      });

      const result = (await tools.search_articles.handler({
        keyword: 'telefonica',
      })) as unknown as {
        items: Array<Record<string, unknown>>;
        total: number;
        pages: number;
      };

      const [endpoint, body] = (client.post as any).mock.calls[0];
      expect(endpoint).toBe('/api/v1/article/getArticles');
      expect(body).toMatchObject({
        keyword: 'telefonica',
        resultType: 'articles',
        articlesPage: 1,
        articlesCount: 10,
        articlesSortBy: 'date',
        articlesSortByAsc: false,
        isDuplicateFilter: 'skipDuplicates',
        forceMaxDataTimeWindow: 31,
        articleBodyLen: 300,
      });
      expect(result.total).toBe(42);
      expect(result.pages).toBe(5);
      expect(result.items).toHaveLength(1);
    });

    it('normalizes articles compactly and truncates the body', async () => {
      (client.post as any).mockResolvedValue({ articles: { results: [wireArticle] } });

      const result = (await tools.search_articles.handler({
        keyword: 'x',
        body_len: 100,
      })) as { items: Array<Record<string, any>> };
      const item = result.items[0];

      expect(item.title).toBe('Telefónica posts results');
      expect(item.body.length).toBeLessThanOrEqual(101);
      expect(item.body.endsWith('…')).toBe(true);
      expect(item.published).toBe('2026-10-19T09:59:00Z');
      expect(item.authors).toEqual(['Jane Doe']);
      expect(item.source).toEqual({ uri: 'example.com', title: 'Example' });
      expect(item).not.toHaveProperty('concepts');
    });

    it('maps filters to Event Registry keys and drops empty arrays', async () => {
      await tools.search_articles.handler({
        concept_uris: ['http://en.wikipedia.org/wiki/Telef%C3%B3nica'],
        source_uris: [],
        lang: ['spa', 'eng'],
        date_start: '2026-10-01',
        date_end: '2026-10-19',
        include_duplicates: true,
        sort_by: 'rel',
        count: 3,
        page: 2,
        allow_archive: true,
        data_types: ['news'],
        ignore_keyword: 'rumor',
      });

      const [, body] = (client.post as any).mock.calls[0];
      expect(body.conceptUri).toEqual(['http://en.wikipedia.org/wiki/Telef%C3%B3nica']);
      expect(body.sourceUri).toBeUndefined();
      expect(body.lang).toEqual(['spa', 'eng']);
      expect(body.dateStart).toBe('2026-10-01');
      expect(body.dateEnd).toBe('2026-10-19');
      expect(body.isDuplicateFilter).toBe('keepAll');
      expect(body.articlesSortBy).toBe('rel');
      expect(body.articlesCount).toBe(3);
      expect(body.articlesPage).toBe(2);
      expect(body.forceMaxDataTimeWindow).toBeUndefined();
      expect(body.dataType).toEqual(['news']);
      expect(body.ignoreKeyword).toBe('rumor');
    });

    it('does not request the body when body_len is 0', async () => {
      await tools.search_articles.handler({ keyword: 'x', body_len: 0 });
      const [, body] = (client.post as any).mock.calls[0];
      expect(body.includeArticleBody).toBe(false);
    });

    it('rejects a search with no filter, without calling the API', async () => {
      await expect(tools.search_articles.handler({})).rejects.toThrow(/at least one of keyword/);
      expect(client.post).not.toHaveBeenCalled();
    });

    it('rejects out-of-range counts and bad dates', async () => {
      await expect(tools.search_articles.handler({ keyword: 'x', count: 101 })).rejects.toThrow(
        /Validation error/
      );
      await expect(
        tools.search_articles.handler({ keyword: 'x', date_start: '19/10/2026' })
      ).rejects.toThrow(/YYYY-MM-DD/);
      await expect(tools.search_articles.handler({ keyword: 'x', lang: ['es'] })).rejects.toThrow(
        /ISO 639-3/
      );
    });

    it('returns an empty page when the API returns nothing', async () => {
      (client.post as any).mockResolvedValue({});
      const result = (await tools.search_articles.handler({ keyword: 'x' })) as {
        items: unknown[];
      };
      expect(result.items).toEqual([]);
    });

    it('is marked readOnlyHint', () => {
      expect(tools.search_articles.readOnlyHint).toBe(true);
      expect(tools.get_article.readOnlyHint).toBe(true);
    });
  });

  describe('get_article', () => {
    it('fetches one article by uri and normalizes it', async () => {
      (client.post as any).mockResolvedValue({ '123': { info: wireArticle } });

      const result = (await tools.get_article.handler({ article_uri: '123' })) as Record<
        string,
        any
      >;

      const [endpoint, body] = (client.post as any).mock.calls[0];
      expect(endpoint).toBe('/api/v1/article/getArticle');
      expect(body).toMatchObject({
        articleUri: '123',
        resultType: 'info',
        infoArticleBodyLen: 3000,
      });
      expect(result.uri).toBe('123');
      expect(result.body.length).toBe(500);
    });

    it('throws a clear error when the article does not exist', async () => {
      (client.post as any).mockResolvedValue({ '999': { error: 'not found' } });
      await expect(tools.get_article.handler({ article_uri: '999' })).rejects.toThrow(
        /Article not found: 999/
      );
    });

    it('requires an article_uri', async () => {
      await expect(tools.get_article.handler({})).rejects.toThrow(/Validation error/);
    });
  });
});
