import { NewsApiClient } from '../newsapi-client.js';
import { normalizeArticle, normalizeArticlePage } from '../domain/normalize.js';
import { getArticleSchema, searchArticlesSchema, withValidation } from '../validation.js';
import { buildCommonQuery, commonSearchProperties, nonEmpty } from './search-common.js';

/**
 * Article tools. Both are read-only; they consume NewsAPI.ai search tokens
 * (1 token per call for data from the last 31 days — see `allow_archive`).
 */
export function getArticleTools(client: NewsApiClient) {
  return {
    search_articles: {
      description:
        'Search news articles (NewsAPI.ai / Event Registry). Cost: 1 token per call (measured live) when limited ' +
        'to the last 31 days (the default); querying the historical archive (allow_archive=true) ' +
        'costs extra tokens per year touched. At least one of keyword / concept_uris / ' +
        'category_uris / source_uris / location_uris is required. Prefer concept_uris (from ' +
        'suggest_concepts, which is free) over free-text keyword for entities — it avoids ' +
        'homonym noise. Results are compact: title, truncated body (body_len, default 300 chars), ' +
        'url, source, date, sentiment. Defaults to 10 results, newest first, duplicates skipped. ' +
        'Paginate with `page`; check `total` and `pages` in the response.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ...commonSearchProperties,
          keyword_loc: {
            type: 'string',
            enum: ['body', 'title', 'body,title'],
            description: 'Where to look for the keyword (default: the API default, body).',
          },
          keyword_search_mode: {
            type: 'string',
            enum: ['simple', 'exact', 'phrase'],
            description: 'How to match the keyword: simple (any word), exact, or phrase.',
          },
          ignore_keyword: { type: 'string', description: 'Exclude articles mentioning this.' },
          ignore_source_uris: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exclude these news sources.',
          },
          data_types: {
            type: 'array',
            items: { type: 'string', enum: ['news', 'pr', 'blog'] },
            description: 'Content types to include (default: all).',
          },
          sort_by: {
            type: 'string',
            enum: ['date', 'rel', 'sourceImportance', 'cosSim'],
            description: 'Sort order (default date). "rel" ranks by relevance to the query.',
          },
          sort_asc: { type: 'boolean', description: 'Ascending order (default false).' },
          count: {
            type: 'integer',
            description: 'Articles per page, 1-100 (default 10). Keep small to save context.',
          },
          body_len: {
            type: 'integer',
            description: 'Max body characters per article, 0-5000 (default 300; 0 = no body).',
          },
          include_duplicates: {
            type: 'boolean',
            description: 'Include duplicate/syndicated articles (default false).',
          },
          min_sentiment: {
            type: 'number',
            description: 'Minimum sentiment, -1 to 1 (English articles only).',
          },
          max_sentiment: {
            type: 'number',
            description: 'Maximum sentiment, -1 to 1 (English articles only).',
          },
        },
        required: [],
      },
      readOnlyHint: true,
      handler: withValidation(searchArticlesSchema, async (args) => {
        const raw = await client.post('/api/v1/article/getArticles', {
          ...buildCommonQuery(args),
          ignoreKeyword: args.ignore_keyword,
          ignoreSourceUri: nonEmpty(args.ignore_source_uris),
          keywordLoc: args.keyword_loc,
          keywordSearchMode: args.keyword_search_mode,
          dataType: args.data_types,
          minSentiment: args.min_sentiment,
          maxSentiment: args.max_sentiment,
          isDuplicateFilter: args.include_duplicates ? 'keepAll' : 'skipDuplicates',
          resultType: 'articles',
          articlesPage: args.page,
          articlesCount: args.count,
          articlesSortBy: args.sort_by,
          articlesSortByAsc: args.sort_asc,
          // Ask only for what the normalizer keeps; skips the heavy concept/category payloads.
          articleBodyLen: args.body_len === 0 ? undefined : args.body_len,
          includeArticleBody: args.body_len > 0,
          includeArticleConcepts: false,
          includeArticleCategories: false,
          includeArticleLocation: false,
          includeArticleSocialScore: false,
          includeArticleOriginalArticle: false,
          includeArticleVideos: false,
          includeArticleLinks: false,
        });
        return normalizeArticlePage(raw, args.body_len);
      }),
    },

    get_article: {
      description:
        'Get one article by its URI (the `uri` returned by search_articles), with a longer body ' +
        '(body_len, default 3000 chars). Cost: 1 token per call. Use after search_articles when ' +
        'you need to read the article rather than just its headline.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          article_uri: {
            type: 'string',
            description: 'Article URI as returned by search_articles (e.g. "8512345678").',
          },
          body_len: {
            type: 'integer',
            description: 'Max body characters, 0-20000 (default 3000).',
          },
        },
        required: ['article_uri'],
      },
      readOnlyHint: true,
      handler: withValidation(getArticleSchema, async (args) => {
        const raw = (await client.post('/api/v1/article/getArticle', {
          articleUri: args.article_uri,
          resultType: 'info',
          infoArticleBodyLen: args.body_len,
          includeArticleBody: args.body_len > 0,
          includeArticleConcepts: false,
        })) as Record<string, unknown>;
        const entry = raw[args.article_uri] as { info?: unknown } | undefined;
        if (!entry || !entry.info) {
          throw new Error(`Article not found: ${args.article_uri}`);
        }
        return normalizeArticle(entry.info, args.body_len);
      }),
    },
  };
}
