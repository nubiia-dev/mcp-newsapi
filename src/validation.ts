import { z } from 'zod';

/**
 * Shared validation schemas for all NewsAPI.ai MCP tools.
 *
 * Tool inputs use snake_case; the tool handlers translate them into Event
 * Registry's camelCase request keys. Result-count defaults are deliberately
 * small: NewsAPI.ai is token-metered (one token per search call, more when the
 * query reaches into the historical archive) and long article lists also burn
 * the calling agent's context window.
 */

/**
 * Parses a `YYYY-MM-DD` string into a UTC midnight timestamp, or `undefined`
 * when it is not a real calendar date (the regex alone would accept 2026-13-45).
 */
export function parseIsoDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return undefined;
  // Date.parse rolls invalid days over in some engines (e.g. 2026-02-30); round-trip to catch that.
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : undefined;
}

/** `YYYY-MM-DD` calendar date, the format Event Registry expects for dateStart/dateEnd. */
const isoDate = z
  .string()
  .refine((v) => parseIsoDate(v) !== undefined, 'must be a real date in YYYY-MM-DD format');

/** ISO 639-3 language code (e.g. `eng`, `spa`, `deu`), as used by Event Registry. */
const langCode = z
  .string()
  .regex(/^[a-z]{3}$/, 'must be a 3-letter ISO 639-3 language code such as eng, spa, deu');

const uriList = z.array(z.string().min(1)).max(20);

/** Fields shared by article and event search. */
const commonSearchFields = {
  /** Free-text keyword or phrase. */
  keyword: z.string().min(1).optional(),
  concept_uris: uriList.optional(),
  category_uris: uriList.optional(),
  source_uris: uriList.optional(),
  location_uris: uriList.optional(),
  lang: z.array(langCode).max(10).optional(),
  date_start: isoDate.optional(),
  date_end: isoDate.optional(),
  /**
   * When false (default) the query is limited to the last 31 days, which is
   * the cheapest tier. Set true to allow the historical archive, which costs
   * extra tokens per queried year.
   */
  allow_archive: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
};

/** Length of the cheap "recent" window, in days (see `forceMaxDataTimeWindow` in search-common.ts). */
export const RECENT_WINDOW_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

const SEARCH_FILTER_KEYS = [
  'keyword',
  'concept_uris',
  'category_uris',
  'source_uris',
  'location_uris',
] as const;

function hasSearchFilter(v: Record<string, unknown>): boolean {
  return SEARCH_FILTER_KEYS.some((k) => {
    const value = v[k];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });
}

/** Adds one calendar year to a UTC timestamp. */
function addOneYear(ms: number): number {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.getTime();
}

/**
 * Cross-field rules for date/archive handling, shared by article and event
 * search. They exist because the archive is billed per year touched:
 *  - without allow_archive the API only sees the last 31 days, so an older
 *    date range would silently return nothing — reject it with an explanation;
 *  - with allow_archive a start date is mandatory and the span is capped at
 *    one year, so a single call can never touch more than ~1 year of archive.
 */
function validateDates(
  v: {
    date_start?: string;
    date_end?: string;
    allow_archive: boolean;
  },
  ctx: z.RefinementCtx
): void {
  const start = v.date_start !== undefined ? parseIsoDate(v.date_start) : undefined;
  const end = v.date_end !== undefined ? parseIsoDate(v.date_end) : undefined;
  const now = Date.now();
  const todayMs = now - (now % DAY_MS);
  const recentLimit = todayMs - RECENT_WINDOW_DAYS * DAY_MS;

  if (start !== undefined && end !== undefined && end < start) {
    ctx.addIssue({
      code: 'custom',
      path: ['date_end'],
      message: 'date_end must be on or after date_start',
    });
  }

  if (!v.allow_archive) {
    if (start !== undefined && start < recentLimit) {
      ctx.addIssue({
        code: 'custom',
        path: ['date_start'],
        message:
          `date_start ${v.date_start} is older than ${RECENT_WINDOW_DAYS} days; searches only ` +
          `cover the last ${RECENT_WINDOW_DAYS} days unless allow_archive=true (which costs ` +
          `extra tokens per year of archive touched)`,
      });
    }
    if (end !== undefined && end < recentLimit) {
      ctx.addIssue({
        code: 'custom',
        path: ['date_end'],
        message:
          `date_end ${v.date_end} is older than ${RECENT_WINDOW_DAYS} days; searches only ` +
          `cover the last ${RECENT_WINDOW_DAYS} days unless allow_archive=true (which costs ` +
          `extra tokens per year of archive touched)`,
      });
    }
    return;
  }

  if (start === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['date_start'],
      message:
        'allow_archive=true requires date_start, so the archive span (billed per year) is ' +
        'bounded; the range may cover at most 1 year',
    });
    return;
  }
  const spanEnd = end ?? todayMs;
  if (spanEnd > addOneYear(start)) {
    ctx.addIssue({
      code: 'custom',
      path: ['date_end'],
      message:
        `archive range ${v.date_start} → ${v.date_end ?? 'today'} is longer than 1 year; ` +
        `narrow it (split into several searches) to keep token cost bounded`,
    });
  }
}

/** Combined refinement for article/event search inputs. */
function refineSearch(
  v: Record<string, unknown> & { date_start?: string; date_end?: string; allow_archive: boolean },
  ctx: z.RefinementCtx
): void {
  if (!hasSearchFilter(v)) {
    ctx.addIssue({ code: 'custom', message: NEEDS_FILTER_MESSAGE });
  }
  validateDates(v, ctx);
}

const NEEDS_FILTER_MESSAGE =
  'provide at least one of keyword, concept_uris, category_uris, source_uris or location_uris ' +
  '(an unfiltered search just returns the latest global firehose and wastes tokens)';

export const articleSortEnum = z.enum(['date', 'rel', 'sourceImportance', 'cosSim']);
export const eventSortEnum = z.enum(['date', 'rel', 'size']);

export const searchArticlesSchema = z
  .object({
    ...commonSearchFields,
    keyword_loc: z.enum(['body', 'title', 'body,title']).optional(),
    keyword_search_mode: z.enum(['simple', 'exact', 'phrase']).optional(),
    ignore_keyword: z.string().min(1).optional(),
    ignore_source_uris: uriList.optional(),
    data_types: z
      .array(z.enum(['news', 'pr', 'blog']))
      .min(1)
      .optional(),
    sort_by: articleSortEnum.optional().default('date'),
    sort_asc: z.boolean().optional().default(false),
    /** Articles per page. Defaults to 10, capped at 100 (API limit). */
    count: z.number().int().min(1).max(100).optional().default(10),
    /** Max body characters per article. 0 omits the body. Defaults to 300. */
    body_len: z.number().int().min(0).max(5000).optional().default(300),
    include_duplicates: z.boolean().optional().default(false),
    min_sentiment: z.number().min(-1).max(1).optional(),
    max_sentiment: z.number().min(-1).max(1).optional(),
  })
  .superRefine(refineSearch);

export const getArticleSchema = z.object({
  article_uri: z.string().min(1),
  /** Max body characters to return. Defaults to 3000 to keep context small. */
  body_len: z.number().int().min(0).max(20000).optional().default(3000),
});

export const searchEventsSchema = z
  .object({
    ...commonSearchFields,
    min_articles_in_event: z.number().int().min(1).optional(),
    sort_by: eventSortEnum.optional().default('date'),
    sort_asc: z.boolean().optional().default(false),
    /** Events per page. Defaults to 10, capped at 50 (API limit). */
    count: z.number().int().min(1).max(50).optional().default(10),
    summary_len: z.number().int().min(0).max(2000).optional().default(300),
  })
  .superRefine(refineSearch);

export const getEventSchema = z.object({
  event_uri: z.string().min(1),
  /** When true, return the event's articles instead of its summary info. */
  include_articles: z.boolean().optional().default(false),
  articles_count: z.number().int().min(1).max(50).optional().default(5),
  articles_page: z.number().int().min(1).optional().default(1),
  body_len: z.number().int().min(0).max(5000).optional().default(300),
});

const suggestBase = {
  /** Text prefix to autocomplete. */
  prefix: z.string().min(1),
  count: z.number().int().min(1).max(50).optional().default(10),
  page: z.number().int().min(1).optional().default(1),
};

export const suggestConceptsSchema = z.object({
  ...suggestBase,
  /** Restrict to concept kinds. */
  types: z
    .array(z.enum(['person', 'loc', 'org', 'wiki']))
    .min(1)
    .optional(),
  /** Language of the prefix (ISO 639-3). */
  lang: langCode.optional().default('eng'),
});

export const suggestCategoriesSchema = z.object(suggestBase);

export const suggestSourcesSchema = z.object({
  ...suggestBase,
  data_types: z
    .array(z.enum(['news', 'pr', 'blog']))
    .min(1)
    .optional(),
});

export const suggestLocationsSchema = z.object({
  ...suggestBase,
  lang: langCode.optional().default('eng'),
});

export const getTrendingConceptsSchema = z.object({
  source: z.enum(['news', 'social', 'pr', 'blog']).optional().default('news'),
  count: z.number().int().min(1).max(50).optional().default(10),
  concept_types: z
    .array(z.enum(['person', 'org', 'loc', 'wiki']))
    .min(1)
    .optional(),
});

export const getUsageSchema = z.object({});

/**
 * Validation utility function
 */
export function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      throw new Error(`Validation error: ${formattedErrors}`);
    }
    throw error;
  }
}

/**
 * Type-safe validation wrapper for tool handlers
 */
export function withValidation<TInput, TOutput>(
  schema: z.ZodType<TInput>,
  handler: (args: TInput) => Promise<TOutput>
) {
  return async (args: unknown): Promise<TOutput> => {
    const validatedArgs = validateInput(schema, args);
    return handler(validatedArgs);
  };
}
