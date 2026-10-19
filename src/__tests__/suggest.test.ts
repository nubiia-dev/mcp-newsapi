import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getSuggestTools } from '../tools/suggest.js';

describe('Suggest Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getSuggestTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getSuggestTools(client);
  });

  describe('suggest_concepts', () => {
    it('calls suggestConceptsFast and normalizes multilingual labels', async () => {
      (client.post as any).mockResolvedValue([
        {
          uri: 'http://en.wikipedia.org/wiki/Telef%C3%B3nica',
          type: 'org',
          label: { eng: 'Telefónica' },
        },
        { uri: 'u2', type: 'wiki', label: 'Plain label' },
      ]);

      const result = (await tools.suggest_concepts.handler({ prefix: 'Telef' })) as {
        items: Array<Record<string, unknown>>;
      };

      expect(client.post).toHaveBeenCalledWith('/api/v1/suggestConceptsFast', {
        prefix: 'Telef',
        source: ['concepts'],
        lang: 'eng',
        conceptLang: 'eng',
        count: 10,
        page: 1,
      });
      expect(result.items).toEqual([
        { uri: 'http://en.wikipedia.org/wiki/Telef%C3%B3nica', label: 'Telefónica', type: 'org' },
        { uri: 'u2', label: 'Plain label', type: 'wiki' },
      ]);
    });

    it('restricts concept types when requested', async () => {
      await tools.suggest_concepts.handler({ prefix: 'x', types: ['person', 'org'], count: 3 });
      const [, body] = (client.post as any).mock.calls[0];
      expect(body.source).toEqual(['person', 'org']);
      expect(body.count).toBe(3);
    });

    it('requires a non-empty prefix', async () => {
      await expect(tools.suggest_concepts.handler({ prefix: '' })).rejects.toThrow(
        /Validation error/
      );
    });
  });

  describe('suggest_categories', () => {
    it('calls suggestCategoriesFast', async () => {
      (client.post as any).mockResolvedValue([{ uri: 'news/Business', label: 'news/Business' }]);
      const result = (await tools.suggest_categories.handler({ prefix: 'busi' })) as {
        items: unknown[];
      };
      expect((client.post as any).mock.calls[0][0]).toBe('/api/v1/suggestCategoriesFast');
      expect(result.items).toEqual([{ uri: 'news/Business', label: 'news/Business' }]);
    });
  });

  describe('suggest_sources', () => {
    it('calls suggestSourcesFast with all data types by default', async () => {
      (client.post as any).mockResolvedValue([
        { uri: 'bbc.co.uk', title: 'BBC', dataType: 'news' },
      ]);
      const result = (await tools.suggest_sources.handler({ prefix: 'bbc' })) as {
        items: unknown[];
      };
      const [endpoint, body] = (client.post as any).mock.calls[0];
      expect(endpoint).toBe('/api/v1/suggestSourcesFast');
      expect(body.dataType).toEqual(['news', 'pr', 'blog']);
      expect(result.items).toEqual([{ uri: 'bbc.co.uk', label: 'BBC', type: 'news' }]);
    });
  });

  describe('suggest_locations', () => {
    it('uses wikiUri as the location uri and adds the country as detail', async () => {
      (client.post as any).mockResolvedValue([
        {
          wikiUri: 'http://en.wikipedia.org/wiki/Madrid',
          type: 'place',
          label: { eng: 'Madrid' },
          country: { label: { eng: 'Spain' } },
        },
      ]);
      const result = (await tools.suggest_locations.handler({ prefix: 'Madr' })) as {
        items: unknown[];
      };
      expect((client.post as any).mock.calls[0][0]).toBe('/api/v1/suggestLocationsFast');
      expect(result.items).toEqual([
        {
          uri: 'http://en.wikipedia.org/wiki/Madrid',
          label: 'Madrid',
          type: 'place',
          detail: 'Spain',
        },
      ]);
    });
  });

  it('returns an empty list when the API returns a non-array', async () => {
    (client.post as any).mockResolvedValue(undefined);
    const result = (await tools.suggest_categories.handler({ prefix: 'zzz' })) as {
      items: unknown[];
    };
    expect(result.items).toEqual([]);
  });

  it('marks every suggest tool readOnlyHint', () => {
    for (const tool of Object.values(tools)) {
      expect(tool.readOnlyHint).toBe(true);
    }
  });
});
