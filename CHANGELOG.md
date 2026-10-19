# [1.0.0] (2026-10-19)

### Features

* initial release: 10 read-only MCP tools for the NewsAPI.ai (Event Registry) API
  - `search_articles`, `get_article`, `search_events`, `get_event`
  - `suggest_concepts`, `suggest_categories`, `suggest_sources`, `suggest_locations`
  - `get_trending_concepts`, `get_usage`
* token-frugal defaults: 10 results per call, 300-character article bodies, last-31-days
  window unless `allow_archive` is set, and unfiltered searches rejected locally
* per-tool token costs documented in the tool descriptions (measured against a live account)
* provider-agnostic domain model (`src/domain/`) decoupled from Event Registry's
  multilingual wire format
* per-tool rate limiting that protects the token budget from runaway agent loops
* API key sent in the request body only and redacted from error text; actionable 401/403
  messages pointing to `NEWSAPI_AI_API_KEY` and `get_usage`
