# [1.0.0] (2026-10-19)

### Features

* initial release: 10 read-only MCP tools for the NewsAPI.ai (Event Registry) API
  - `search_articles`, `get_article`, `search_events`, `get_event`
  - `suggest_concepts`, `suggest_categories`, `suggest_sources`, `suggest_locations`
  - `get_trending_concepts`, `get_usage`
* token-frugal defaults: 10 results per call, 300-character article bodies, last-31-days
  window unless `allow_archive` is set, and unfiltered searches rejected locally
* archive guard: `allow_archive` requires `date_start` and a range of at most 1 year; old
  dates without `allow_archive` and impossible/reversed dates are rejected with explanations
* session token budget (`NEWSAPI_AI_MAX_TOKENS_PER_SESSION`, default 200) charged with the
  measured per-call costs before each request
* per-tool token costs documented in the tool descriptions (measured against a live account)
* provider-agnostic domain model (`src/domain/`) decoupled from Event Registry's
  multilingual wire format
* per-tool rate limiting that protects the token budget from runaway agent loops
* 30s request timeout; retries only on 429/502/503/504 and pre-connection errors, never on
  ambiguous failures of metered calls
* API key sent in the request body only and redacted (before truncation) from all error text; actionable 401/403
  messages pointing to `NEWSAPI_AI_API_KEY` and `get_usage`
