import { NewsApiClient } from '../newsapi-client.js';
import { normalizeSuggestions } from '../domain/normalize.js';
import {
  suggestCategoriesSchema,
  suggestConceptsSchema,
  suggestLocationsSchema,
  suggestSourcesSchema,
  withValidation,
} from '../validation.js';

const prefixProp = {
  type: 'string',
  description: 'Text typed so far (a name or the start of one), e.g. "Telef" or "bbc".',
};
const countProp = {
  type: 'integer',
  description: 'Max suggestions, 1-50 (default 10).',
};
const pageProp = { type: 'integer', description: 'Result page, from 1 (default 1).' };

/**
 * Autosuggest tools resolve a human name ("Telefónica", "BBC", "Madrid") into
 * the URI that search_articles / search_events need. They hit the `*Fast`
 * suggest endpoints, which are not billed as searches, so call them liberally
 * before every search that involves an entity.
 */
export function getSuggestTools(client: NewsApiClient) {
  return {
    suggest_concepts: {
      description:
        'Resolve a name to concept URIs (people, organisations, places, Wikipedia topics). Pass ' +
        'the returned `uri` as concept_uris to search_articles / search_events — much more ' +
        'precise than a keyword. Does not consume search tokens. Sorted by prominence in the ' +
        'news; check `type` and `label` to pick the right homonym.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          prefix: prefixProp,
          types: {
            type: 'array',
            items: { type: 'string', enum: ['person', 'loc', 'org', 'wiki'] },
            description: 'Restrict to these concept kinds (default: all).',
          },
          lang: { type: 'string', description: 'Language of the prefix, ISO 639-3 (default eng).' },
          count: countProp,
          page: pageProp,
        },
        required: ['prefix'],
      },
      readOnlyHint: true,
      handler: withValidation(suggestConceptsSchema, async (args) => {
        const raw = await client.post('/api/v1/suggestConceptsFast', {
          prefix: args.prefix,
          source: args.types ?? ['concepts'],
          lang: args.lang,
          conceptLang: 'eng',
          count: args.count,
          page: args.page,
        });
        return normalizeSuggestions(raw);
      }),
    },

    suggest_categories: {
      description:
        'Resolve a topic name to category URIs (e.g. "news/Business", "dmoz/Sports/Soccer"). ' +
        'Pass the `uri` as category_uris to search_articles / search_events. Does not consume ' +
        'search tokens.',
      inputSchema: {
        type: 'object' as const,
        properties: { prefix: prefixProp, count: countProp, page: pageProp },
        required: ['prefix'],
      },
      readOnlyHint: true,
      handler: withValidation(suggestCategoriesSchema, async (args) => {
        const raw = await client.post('/api/v1/suggestCategoriesFast', {
          prefix: args.prefix,
          count: args.count,
          page: args.page,
        });
        return normalizeSuggestions(raw);
      }),
    },

    suggest_sources: {
      description:
        'Resolve a publication name or domain to news source URIs (e.g. "bbc.co.uk"). Pass the ' +
        '`uri` as source_uris to search_articles / search_events. Does not consume search tokens.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          prefix: prefixProp,
          data_types: {
            type: 'array',
            items: { type: 'string', enum: ['news', 'pr', 'blog'] },
            description: 'Restrict to sources of these content types (default: all).',
          },
          count: countProp,
          page: pageProp,
        },
        required: ['prefix'],
      },
      readOnlyHint: true,
      handler: withValidation(suggestSourcesSchema, async (args) => {
        const raw = await client.post('/api/v1/suggestSourcesFast', {
          prefix: args.prefix,
          dataType: args.data_types ?? ['news', 'pr', 'blog'],
          count: args.count,
          page: args.page,
        });
        return normalizeSuggestions(raw);
      }),
    },

    suggest_locations: {
      description:
        'Resolve a city or country name to a location URI. Pass the `uri` as location_uris to ' +
        'search_articles / search_events to find news that happened there. Does not consume ' +
        'search tokens.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          prefix: prefixProp,
          lang: { type: 'string', description: 'Language of the prefix, ISO 639-3 (default eng).' },
          count: countProp,
          page: pageProp,
        },
        required: ['prefix'],
      },
      readOnlyHint: true,
      handler: withValidation(suggestLocationsSchema, async (args) => {
        const raw = await client.post('/api/v1/suggestLocationsFast', {
          prefix: args.prefix,
          lang: args.lang,
          count: args.count,
          page: args.page,
        });
        return normalizeSuggestions(raw);
      }),
    },
  };
}
