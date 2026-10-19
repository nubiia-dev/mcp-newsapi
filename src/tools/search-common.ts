import type { RequestBody } from '../newsapi-client.js';
import { RECENT_WINDOW_DAYS } from '../validation.js';

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

/**
 * JSON-schema fragment for a list-of-strings parameter that the server also
 * accepts as a single string (see `stringOrArray` in validation.ts). Expressed
 * as `anyOf` so schema-validating clients do not reject the scalar form.
 *
 * @param description - Human-readable parameter description.
 * @param itemSchema - JSON schema of one element (defaults to a plain string).
 */
export function listProperty(
  description: string,
  itemSchema: Record<string, unknown> = { type: 'string' }
) {
  return {
    anyOf: [itemSchema, { type: 'array', items: itemSchema }],
    description: `${description} Accepts a single string or an array of strings.`,
  };
}

/** Shared JSON-schema fragment for the filters common to article and event search. */
export const commonSearchProperties = {
  keyword: {
    type: 'string',
    description:
      'Free-text keyword or phrase, for topics and general terms (e.g. "inflation", "wildfire"). ' +
      'Do NOT use it for companies, people, places or organisations: common words double as ' +
      'names (e.g. "Telefónica" also matches the ordinary Spanish adjective "telefónica") and ' +
      'produce irrelevant results. For those entities call suggest_concepts first and pass the ' +
      'returned URI in concept_uris.',
  },
  concept_uris: listProperty(
    'Concept URIs for entities: companies, people, places, organisations. PREFERRED over ' +
      'keyword for any named entity: first call suggest_concepts (free) to resolve the name, ' +
      'then pass the returned `uri` here. Multiple values are OR-ed and far more precise than ' +
      'keyword, which avoids homonym noise.'
  ),
  category_uris: listProperty(
    'Category URIs, e.g. "news/Business" (use suggest_categories). OR-ed.'
  ),
  source_uris: listProperty('News source URIs, e.g. "bbc.co.uk" (use suggest_sources). OR-ed.'),
  location_uris: listProperty(
    'Location URIs where the news happened (use suggest_locations). OR-ed.'
  ),
  lang: listProperty('3-letter ISO 639-3 language codes, e.g. "spa" or ["eng", "spa"]. OR-ed.', {
    type: 'string',
    pattern: '^[a-z]{3}$',
  }),
  date_start: {
    type: 'string',
    description:
      'Earliest date, YYYY-MM-DD (inclusive). Must be within the last 31 days unless ' +
      'allow_archive=true, which makes date_start mandatory.',
  },
  date_end: {
    type: 'string',
    description:
      'Latest date, YYYY-MM-DD (inclusive); must be >= date_start. With allow_archive the ' +
      'date_start → date_end (default today) span may be at most 1 year.',
  },
  allow_archive: {
    type: 'boolean',
    description:
      'Default false: search only the last 31 days (cheapest). Set true to reach the historical ' +
      'archive, which costs extra tokens per year queried; requires date_start and a range of ' +
      'at most 1 year.',
  },
  page: { type: 'integer', description: 'Result page, starting at 1 (default 1).' },
};
