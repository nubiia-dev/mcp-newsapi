import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getEventTools } from '../tools/events.js';

const wireEvent = {
  uri: 'eng-1',
  title: { eng: 'Telco Days announced' },
  summary: { eng: 'S'.repeat(600) },
  eventDate: '2026-11-06',
  totalArticleCount: 6,
  location: { type: 'place', label: { eng: 'Kraków' } },
  concepts: Array.from({ length: 12 }, (_, i) => ({
    uri: `c${i}`,
    type: 'org',
    label: { eng: `Concept ${i}` },
  })),
  categories: [{ uri: 'news/Technology', label: 'news/Technology', wgt: 1 }],
  sentiment: 0.1,
};

describe('Event Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getEventTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getEventTools(client);
  });

  describe('search_events', () => {
    it('sends the default query and normalizes events', async () => {
      (client.post as any).mockResolvedValue({
        events: { results: [wireEvent], totalResults: 97, page: 1, pages: 10 },
      });

      const result = (await tools.search_events.handler({ keyword: 'telco' })) as {
        items: Array<Record<string, any>>;
        total: number;
      };

      const [endpoint, body] = (client.post as any).mock.calls[0];
      expect(endpoint).toBe('/api/v1/event/getEvents');
      expect(body).toMatchObject({
        keyword: 'telco',
        resultType: 'events',
        eventsPage: 1,
        eventsCount: 10,
        eventsSortBy: 'date',
        forceMaxDataTimeWindow: 31,
      });
      expect(result.total).toBe(97);
      const ev = result.items[0];
      expect(ev.title).toBe('Telco Days announced');
      expect(ev.summary.length).toBe(301);
      expect(ev.location).toBe('Kraków');
      expect(ev.concepts).toHaveLength(8);
      expect(ev.categories).toEqual(['news/Technology']);
    });

    it('passes min_articles_in_event and size sorting', async () => {
      await tools.search_events.handler({
        concept_uris: ['c1'],
        min_articles_in_event: 20,
        sort_by: 'size',
        count: 50,
      });
      const [, body] = (client.post as any).mock.calls[0];
      expect(body.minArticlesInEvent).toBe(20);
      expect(body.eventsSortBy).toBe('size');
      expect(body.eventsCount).toBe(50);
      expect(body.conceptUri).toEqual(['c1']);
    });

    it('rejects a filterless search and count above 50', async () => {
      await expect(tools.search_events.handler({})).rejects.toThrow(/at least one of keyword/);
      await expect(tools.search_events.handler({ keyword: 'x', count: 51 })).rejects.toThrow(
        /Validation error/
      );
      expect(client.post).not.toHaveBeenCalled();
    });

    it('is marked readOnlyHint', () => {
      expect(tools.search_events.readOnlyHint).toBe(true);
      expect(tools.get_event.readOnlyHint).toBe(true);
    });
  });

  describe('get_event', () => {
    it('returns event info by default', async () => {
      (client.post as any).mockResolvedValue({ 'eng-1': { info: wireEvent } });

      const result = (await tools.get_event.handler({ event_uri: 'eng-1' })) as Record<string, any>;

      const [endpoint, body] = (client.post as any).mock.calls[0];
      expect(endpoint).toBe('/api/v1/event/getEvent');
      expect(body).toMatchObject({ eventUri: 'eng-1', resultType: 'info' });
      expect(result.uri).toBe('eng-1');
      expect(result.title).toBe('Telco Days announced');
    });

    it('returns the articles of the event when include_articles is true', async () => {
      (client.post as any).mockResolvedValue({
        'eng-1': {
          articles: {
            results: [{ uri: '9', title: 'A', body: 'text', source: { uri: 's.com' } }],
            totalResults: 6,
            page: 1,
            pages: 6,
          },
        },
      });

      const result = (await tools.get_event.handler({
        event_uri: 'eng-1',
        include_articles: true,
        articles_count: 1,
      })) as unknown as { items: Array<Record<string, unknown>>; total: number };

      const [, body] = (client.post as any).mock.calls[0];
      expect(body).toMatchObject({ resultType: 'articles', articlesCount: 1, articlesPage: 1 });
      expect(result.items[0].uri).toBe('9');
      expect(result.total).toBe(6);
    });

    it('throws a clear error for an unknown event', async () => {
      (client.post as any).mockResolvedValue({ 'eng-9': { error: 'nope' } });
      await expect(tools.get_event.handler({ event_uri: 'eng-9' })).rejects.toThrow(
        /Event not found: eng-9/
      );
    });
  });
});
