import { NewsApiClient } from '../newsapi-client.js';
import { normalizeArticlePage, normalizeEvent, normalizeEventPage } from '../domain/normalize.js';
import { getEventSchema, searchEventsSchema, withValidation } from '../validation.js';
import { buildCommonQuery, commonSearchProperties } from './search-common.js';

/**
 * Event tools. An "event" is Event Registry's cluster of articles from many
 * outlets/languages covering the same real-world happening — the right
 * granularity for "what is happening with X" questions, and far cheaper in
 * context than reading dozens of articles.
 */
export function getEventTools(client: NewsApiClient) {
  return {
    search_events: {
      description:
        'Search news EVENTS: clusters of articles about the same real-world happening, with a ' +
        'title, summary, date, location, key concepts and article count. Best for "what is ' +
        'happening with X" — one event replaces dozens of near-duplicate articles. Cost: 5 tokens (measured live) ' +
        'per call within the last 31 days (default); allow_archive=true costs extra per year ' +
        'touched. At least one of keyword / concept_uris / category_uris / source_uris / ' +
        'location_uris is required. Defaults to 10 events, newest first; use sort_by="size" for ' +
        'the biggest stories. Use get_event for details on one.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ...commonSearchProperties,
          min_articles_in_event: {
            type: 'integer',
            description: 'Only events covered by at least this many articles (filters noise).',
          },
          sort_by: {
            type: 'string',
            enum: ['date', 'rel', 'size'],
            description: 'Sort order (default date). "size" = most articles first.',
          },
          sort_asc: { type: 'boolean', description: 'Ascending order (default false).' },
          count: { type: 'integer', description: 'Events per page, 1-50 (default 10).' },
          summary_len: {
            type: 'integer',
            description: 'Max summary characters per event, 0-2000 (default 300).',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(searchEventsSchema, async (args) => {
        const raw = await client.post('/api/v1/event/getEvents', {
          ...buildCommonQuery(args),
          minArticlesInEvent: args.min_articles_in_event,
          resultType: 'events',
          eventsPage: args.page,
          eventsCount: args.count,
          eventsSortBy: args.sort_by,
          eventsSortByAsc: args.sort_asc,
          includeEventSummary: args.summary_len > 0,
          includeEventConcepts: true,
          includeEventCategories: true,
          includeEventLocation: true,
          includeEventArticleCounts: true,
          includeEventSocialScore: false,
          includeEventCommonDates: false,
          includeEventStories: false,
          eventImageCount: 0,
        });
        return normalizeEventPage(raw, args.summary_len);
      }),
    },

    get_event: {
      description:
        'Get one event by URI (the `uri` from search_events, e.g. "eng-1234567"). Returns its ' +
        'summary info by default; set include_articles=true to instead list the articles ' +
        'covering it (paginated, default 5 per page, body truncated to body_len). Cost: 5 tokens (info view) or 1 (articles view), measured live.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          event_uri: { type: 'string', description: 'Event URI, e.g. "eng-1234567".' },
          include_articles: {
            type: 'boolean',
            description: 'Return the event’s articles instead of its info (default false).',
          },
          articles_count: {
            type: 'integer',
            description: 'Articles per page when include_articles=true, 1-50 (default 5).',
          },
          articles_page: { type: 'integer', description: 'Articles page, from 1 (default 1).' },
          body_len: {
            type: 'integer',
            description: 'Max body characters per article, 0-5000 (default 300).',
          },
        },
        required: ['event_uri'],
      },
      readOnlyHint: true,
      handler: withValidation(getEventSchema, async (args) => {
        const resultType = args.include_articles ? 'articles' : 'info';
        const raw = (await client.post('/api/v1/event/getEvent', {
          eventUri: args.event_uri,
          resultType,
          ...(args.include_articles
            ? {
                articlesPage: args.articles_page,
                articlesCount: args.articles_count,
                articlesSortBy: 'cosSim',
                articleBodyLen: args.body_len === 0 ? undefined : args.body_len,
                includeArticleBody: args.body_len > 0,
                includeArticleConcepts: false,
              }
            : { includeEventSummary: true, includeEventConcepts: true }),
        })) as Record<string, unknown>;
        const entry = raw[args.event_uri] as Record<string, unknown> | undefined;
        if (!entry || !entry[resultType]) {
          throw new Error(`Event not found: ${args.event_uri}`);
        }
        return args.include_articles
          ? normalizeArticlePage(entry, args.body_len)
          : normalizeEvent(entry.info, 1000);
      }),
    },
  };
}
