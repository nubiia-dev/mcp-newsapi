# NewsAPI.ai / Event Registry API notes

Behaviour observed while building this server (October 2026), against a live free-plan
account plus the official `eventregistry` Python SDK as reference. The public docs at
newsapi.ai/documentation are a JavaScript app and could not be scraped, so the SDK was the
source of endpoint paths and parameter names; everything marked **verified** was also
exercised against the real API.

## Transport

- Host `https://eventregistry.org`, paths under `/api/v1/`. POST with a JSON body.
- Auth is an `apiKey` property of the body (this server never puts it in the URL).
- Invalid key: HTTP 401 with a plain-text message.
- At most 5 simultaneous requests; excess requests get 429 (retried with backoff).

## Endpoints used

| Tool | Endpoint | Status |
|---|---|---|
| `search_articles` | `/api/v1/article/getArticles` | verified |
| `get_article` | `/api/v1/article/getArticle` (`resultType: info`) | verified |
| `search_events` | `/api/v1/event/getEvents` | verified |
| `get_event` | `/api/v1/event/getEvent` (`resultType: info` or `articles`) | verified |
| `suggest_concepts` | `/api/v1/suggestConceptsFast` | verified |
| `suggest_categories` | `/api/v1/suggestCategoriesFast` | verified |
| `suggest_sources` | `/api/v1/suggestSourcesFast` | verified |
| `suggest_locations` | `/api/v1/suggestLocationsFast` | verified |
| `get_trending_concepts` | `/api/v1/trends/getTrendingConcepts` | verified |
| `get_usage` | `/api/v1/usage` → `{ availableTokens, usedTokens }` | verified |

## Token costs (measured, free plan, last-31-days window)

| Call | Tokens |
|---|---|
| `getArticles` (any `articlesCount`) | 1 |
| `getArticle` | 1 |
| `getEvents` (any `eventsCount`) | 5 |
| `getEvent` `info` | 5 |
| `getEvent` `articles` | 1 |
| `getTrendingConcepts` (any count) | 10 |
| `suggest*Fast`, `usage` | 0 |

The free plan observed had 2000 tokens. Queries that reach into the archive (older than 31
days) are billed extra per year touched; this server avoids that by sending
`forceMaxDataTimeWindow: 31` unless `allow_archive` is true.

## Trends data types

`getTrendingConcepts` accepts `dataType` = `news`, `blog` or `pr` (plus `source: social`).
`blogs` (as written in the Python SDK docs) is rejected: *"unknown data type: blogs. Valid
values for the parameter are news, blog or pr."* — that rejection is free. `blog` is
accepted but, on the observed free-plan account, answered *"Trends with the given
parameters were not computed."* and **was still billed 10 tokens**. `pr` was not called.

## Error responses

Besides HTTP 4xx/5xx, the API reports failures as HTTP 200 with `{"error": "..."}`; some
of those are billed (see above). The client treats them as errors and does not refund.

## Response shapes (relevant parts)

- Articles: `{ articles: { results[], totalResults, page, pages } }`. Each result has
  `uri`, `title`, `body`, `url`, `dateTimePub`, `lang`, `source{uri,title}`, `authors[]`,
  `sentiment` (English only), `image`, `eventUri`.
- Events: `{ events: { results[], totalResults, page, pages } }`. Titles/summaries/labels
  are multilingual maps (`{ "eng": "..." }`).
- Single article/event: `{ "<uri>": { "info": { ... } } }`; event articles are under
  `"articles"`.
- Category URIs look like `dmoz/Business` or `news/Technology`; source URIs are domains
  (`bbc.com`).
- Concept labels are `{ eng: "..." }`; locations use `wikiUri` instead of `uri`.

## Input conventions

- List parameters (`lang`, `*_uris`, `data_types`, `types`, `concept_types`) accept a single
  string or an array; the server normalizes both to an array before building the request.
  The published JSON schema declares them as `anyOf: [string, array of string]`.
- `keyword` matches plain text, so homonyms add noise (e.g. "Telefónica" vs. the adjective
  "telefónica"). Entities should be resolved with `suggest_concepts` and sent as `concept_uris`.

## Open items

- Rate limits other than the 5-simultaneous-requests rule are unknown; the local limits
  in `src/index.ts` are conservative guards, not API limits.
- Archive pricing (tokens per year) is documented by the vendor, not measured here.
