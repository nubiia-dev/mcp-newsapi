import { NewsApiClient } from '../newsapi-client.js';
import { normalizeTrendingConcepts } from '../domain/normalize.js';
import { getTrendingConceptsSchema, withValidation } from '../validation.js';

/**
 * Trending is computed server-side by comparing how much a concept appears in
 * the last two days against the last two weeks.
 */
export function getTrendTools(client: NewsApiClient) {
  return {
    get_trending_concepts: {
      description:
        'Get the concepts (people, organisations, places) that are trending right now in the ' +
        'news — computed by comparing mentions in the last 2 days against the last 2 weeks. ' +
        'Use `source` to switch between news, social, pr and blog (blog trends are not computed on ' +
        'every plan: the API then answers "not computed" and the call is still billed). Defaults to the top 10 ' +
        'people/organisations/places in news. Cost: 10 tokens per call regardless of count (measured live) - the priciest tool, use sparingly.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          source: {
            type: 'string',
            enum: ['news', 'social', 'pr', 'blog'],
            description: 'Data source to compute trends from (default news).',
          },
          count: { type: 'integer', description: 'How many trends, 1-50 (default 10).' },
          concept_types: {
            type: 'array',
            items: { type: 'string', enum: ['person', 'org', 'loc', 'wiki'] },
            description: 'Concept kinds to include (default: person, org, loc).',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(getTrendingConceptsSchema, async (args) => {
        const raw = await client.post('/api/v1/trends/getTrendingConcepts', {
          action: 'getTrendingConcepts',
          source: args.source,
          dataType: args.source === 'social' ? undefined : args.source,
          conceptCount: args.count,
          conceptType: args.concept_types ?? ['person', 'org', 'loc'],
        });
        return normalizeTrendingConcepts(raw);
      }),
    },
  };
}
