## [1.0.2](https://github.com/nubiia-dev/mcp-newsapi/compare/v1.0.1...v1.0.2) (2026-10-22)


### Bug Fixes

* unref the rate limiter cleanup timer so the process exits on stdin close ([2ac2992](https://github.com/nubiia-dev/mcp-newsapi/commit/2ac299237ec73ebd83ea4e62106d6bf52db0d146))

## [1.0.1](https://github.com/nubiia-dev/mcp-newsapi/compare/v1.0.0...v1.0.1) (2026-10-19)


### Bug Fixes

* accept a single string for list parameters and guide entity searches ([4d0e850](https://github.com/nubiia-dev/mcp-newsapi/commit/4d0e850aee2317e09688ed725cdfbcc8b77c32b9))

# 1.0.0 (2026-10-19)


### Features

* add session token budget and archive/date guards ([a12fbf5](https://github.com/nubiia-dev/mcp-newsapi/commit/a12fbf5f68a6ba51276c9c6f395ad827eba34122))
  - session token budget (`NEWSAPI_AI_MAX_TOKENS_PER_SESSION`, default 200) charged with the
    measured per-call costs before each request
  - archive guard: `allow_archive` requires `date_start` and a range of at most 1 year; old
    dates without `allow_archive` and impossible/reversed dates are rejected with explanations
  - 30s request timeout; retries only on 429/502/503/504 and pre-connection errors, never on
    ambiguous failures of metered calls
  - API key redacted (before truncation) from all error text
* implement mcp-newsapi v1 ([cdc3bbd](https://github.com/nubiia-dev/mcp-newsapi/commit/cdc3bbd25ca9f0140e7668f7c8fa4893af20daed))
  - 10 read-only tools: `search_articles`, `get_article`, `search_events`, `get_event`,
    `suggest_concepts`, `suggest_categories`, `suggest_sources`, `suggest_locations`,
    `get_trending_concepts`, `get_usage`
  - token-frugal defaults: 10 results per call, 300-character article bodies, last-31-days
    window unless `allow_archive` is set, and unfiltered searches rejected locally
  - per-tool token costs documented in the tool descriptions (measured against a live account)
  - provider-agnostic domain model (`src/domain/`) decoupled from Event Registry's
    multilingual wire format
  - per-tool rate limiting that protects the token budget from runaway agent loops
  - API key sent in the request body only; actionable 401/403 messages pointing to
    `NEWSAPI_AI_API_KEY` and `get_usage`
