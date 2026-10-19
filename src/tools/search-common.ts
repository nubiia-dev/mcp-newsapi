import type { RequestBody } from '../newsapi-client.js';

/** Filter inputs shared by search_articles and search_events (snake_case, already validated). */
export interface CommonSearchArgs {
  keyword?: string;
  concept_uris?: string[];
  category_uris?: string[];
  source_uris?: string[];
  location_uris?: string[];
  lang?: string[];
  date_start?: string;
  date_end?: string;
  allow_archive: boolean;
}

/**
 * `forceMaxDataTimeWindow: 31` restricts a query to the last 31 days, the
 * cheapest tier (Event Registry bills extra tokens per year of archive
 * touched). It is applied unless the caller explicitly opts into the archive.
 */
const RECENT_WINDOW_DAYS = 31;

/** Returns `value` unchanged when it is a non-empty array, else `undefined` (so the key is dropped). */
export function nonEmpty<T>(value: T[] | undefined): T[] | undefined {
  return value && value.length > 0 ? value : undefined;
}

/**
 * Translates the shared snake_case filters into Event Registry's camelCase
 * request keys. Multiple values for one key are sent as an array, which Event
 * Registry treats as OR.
 */
export function buildCommonQuery(args: CommonSearchArgs): RequestBody {
  return {
    keyword: args.keyword,
    conceptUri: nonEmpty(args.concept_uris),
    categoryUri: nonEmpty(args.category_uris),
    sourceUri: nonEmpty(args.source_uris),
    locationUri: nonEmpty(args.location_uris),
    lang: nonEmpty(args.lang),
    dateStart: args.date_start,
    dateEnd: args.date_end,
    forceMaxDataTimeWindow: args.allow_archive ? undefined : RECENT_WINDOW_DAYS,
  };
}

/** Shared JSON-schema fragment for the filters common to article and event search. */
export const commonSearchProperties = {
  keyword: {
    type: 'string',
    description: 'Free-text keyword or phrase to search for.',
  },
  concept_uris: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Concept URIs (entities such as people, companies, places) — obtain them with ' +
      'suggest_concepts. Multiple values are OR-ed. Far more precise than keyword.',
  },
  category_uris: {
    type: 'array',
    items: { type: 'string' },
    description: 'Category URIs, e.g. "news/Business" (use suggest_categories). OR-ed.',
  },
  source_uris: {
    type: 'array',
    items: { type: 'string' },
    description: 'News source URIs, e.g. "bbc.co.uk" (use suggest_sources). OR-ed.',
  },
  location_uris: {
    type: 'array',
    items: { type: 'string' },
    description: 'Location URIs where the news happened (use suggest_locations). OR-ed.',
  },
  lang: {
    type: 'array',
    items: { type: 'string' },
    description: '3-letter ISO 639-3 language codes, e.g. ["eng", "spa"]. OR-ed.',
  },
  date_start: { type: 'string', description: 'Earliest date, YYYY-MM-DD (inclusive).' },
  date_end: { type: 'string', description: 'Latest date, YYYY-MM-DD (inclusive).' },
  allow_archive: {
    type: 'boolean',
    description:
      'Default false: search only the last 31 days (cheapest). Set true to reach the historical ' +
      'archive, which costs extra tokens per year queried.',
  },
  page: { type: 'integer', description: 'Result page, starting at 1 (default 1).' },
};
