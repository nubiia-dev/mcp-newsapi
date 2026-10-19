import { describe, it, expect, beforeEach } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getArticleTools } from '../tools/articles.js';
import { getEventTools } from '../tools/events.js';
import { getSuggestTools } from '../tools/suggest.js';
import { getTrendTools } from '../tools/trends.js';
import {
  searchArticlesSchema,
  suggestConceptsSchema,
  suggestSourcesSchema,
  getTrendingConceptsSchema,
  stringOrArray,
} from '../validation.js';
import { z } from 'zod';

describe('stringOrArray', () => {
  const schema = stringOrArray(z.string().min(1), { max: 2 });

  it('wraps a single string into an array', () => {
    expect(schema.parse('a')).toEqual(['a']);
  });

  it('keeps an array unchanged', () => {
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('rejects invalid values', () => {
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse(['a', '']).success).toBe(false);
    expect(schema.safeParse(['a', 'b', 'c']).success).toBe(false);
    expect(schema.safeParse(42).success).toBe(false);
    expect(schema.safeParse([1]).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });
});

describe('list parameters accept string or array', () => {
  it('normalizes every search list filter', () => {
    const parsed = searchArticlesSchema.parse({
      concept_uris: 'c1',
      category_uris: ['cat1', 'cat2'],
      source_uris: 's1',
      location_uris: 'l1',
      ignore_source_uris: 'bad.com',
      lang: 'spa',
      data_types: 'news',
    });
    expect(parsed.concept_uris).toEqual(['c1']);
    expect(parsed.category_uris).toEqual(['cat1', 'cat2']);
    expect(parsed.source_uris).toEqual(['s1']);
    expect(parsed.location_uris).toEqual(['l1']);
    expect(parsed.ignore_source_uris).toEqual(['bad.com']);
    expect(parsed.lang).toEqual(['spa']);
    expect(parsed.data_types).toEqual(['news']);
  });

  it('keeps lang arrays as they are', () => {
    expect(searchArticlesSchema.parse({ keyword: 'x', lang: ['eng', 'spa'] }).lang).toEqual([
      'eng',
      'spa',
    ]);
  });

  it('still validates lang codes and enum members', () => {
    expect(searchArticlesSchema.safeParse({ keyword: 'x', lang: 'es' }).success).toBe(false);
    expect(searchArticlesSchema.safeParse({ keyword: 'x', lang: ['eng', 'EN'] }).success).toBe(
      false
    );
    expect(searchArticlesSchema.safeParse({ keyword: 'x', data_types: 'video' }).success).toBe(
      false
    );
    expect(searchArticlesSchema.safeParse({ keyword: 'x', data_types: [] }).success).toBe(false);
    expect(searchArticlesSchema.safeParse({ concept_uris: '' }).success).toBe(false);
  });

  it('normalizes the suggest and trends list parameters', () => {
    expect(suggestConceptsSchema.parse({ prefix: 'a', types: 'org' }).types).toEqual(['org']);
    expect(suggestSourcesSchema.parse({ prefix: 'a', data_types: 'blog' }).data_types).toEqual([
      'blog',
    ]);
    expect(getTrendingConceptsSchema.parse({ concept_types: 'person' }).concept_types).toEqual([
      'person',
    ]);
    expect(suggestConceptsSchema.safeParse({ prefix: 'a', types: 'company' }).success).toBe(false);
  });

  describe('through the tool handlers', () => {
    let client: ReturnType<typeof createMockClient>;

    beforeEach(() => {
      client = createMockClient();
    });

    it('sends a scalar lang to the API as an array (search_articles)', async () => {
      await getArticleTools(client).search_articles.handler({
        concept_uris: 'http://en.wikipedia.org/wiki/Telef%C3%B3nica',
        lang: 'spa',
      });
      const body = vi_lastBody(client);
      expect(body.lang).toEqual(['spa']);
      expect(body.conceptUri).toEqual(['http://en.wikipedia.org/wiki/Telef%C3%B3nica']);
    });

    it('sends a scalar lang to the API as an array (search_events)', async () => {
      await getEventTools(client).search_events.handler({ keyword: 'x', lang: 'spa' });
      expect(vi_lastBody(client).lang).toEqual(['spa']);
    });

    it('rejects an invalid scalar before calling the API', async () => {
      await expect(
        getArticleTools(client).search_articles.handler({ keyword: 'x', lang: 'español' })
      ).rejects.toThrow(/lang/);
      expect(client.post).not.toHaveBeenCalled();
    });
  });
});

describe('published JSON schemas', () => {
  const client = createMockClient();
  const listKeys: Array<[string, Record<string, unknown>, string[]]> = [
    [
      'search_articles',
      getArticleTools(client).search_articles.inputSchema.properties,
      [
        'concept_uris',
        'category_uris',
        'source_uris',
        'location_uris',
        'lang',
        'ignore_source_uris',
        'data_types',
      ],
    ],
    [
      'search_events',
      getEventTools(client).search_events.inputSchema.properties,
      ['concept_uris', 'category_uris', 'source_uris', 'location_uris', 'lang'],
    ],
    [
      'suggest_concepts',
      getSuggestTools(client).suggest_concepts.inputSchema.properties,
      ['types'],
    ],
    [
      'suggest_sources',
      getSuggestTools(client).suggest_sources.inputSchema.properties,
      ['data_types'],
    ],
    [
      'get_trending_concepts',
      getTrendTools(client).get_trending_concepts.inputSchema.properties,
      ['concept_types'],
    ],
  ];

  it.each(listKeys)('%s declares list params as string | string[]', (_tool, props, keys) => {
    for (const key of keys) {
      const prop = props[key] as {
        anyOf: Array<{ type: string; items?: unknown }>;
        description: string;
      };
      expect(prop.anyOf.map((s) => s.type).sort()).toEqual(['array', 'string']);
      expect(prop.description).toMatch(/single string or an array/);
    }
  });

  it('steers entity searches to suggest_concepts', () => {
    const props = getArticleTools(client).search_articles.inputSchema.properties;
    expect(props.keyword.description).toMatch(/suggest_concepts/);
    expect(props.concept_uris.description).toMatch(/suggest_concepts/);
    expect(getEventTools(client).search_events.description).toMatch(/suggest_concepts/);
    expect(getArticleTools(client).search_articles.description).toMatch(/suggest_concepts/);
  });
});

/** Body of the most recent POST made through the mocked client. */
function vi_lastBody(client: ReturnType<typeof createMockClient>): Record<string, unknown> {
  const calls = (client.post as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
}
