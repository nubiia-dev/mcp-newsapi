# MCP NewsAPI.ai

[![CI](https://github.com/nubiia-dev/mcp-newsapi/actions/workflows/ci.yml/badge.svg)](https://github.com/nubiia-dev/mcp-newsapi/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40nubiia%2Fmcp-newsapi.svg)](https://www.npmjs.com/package/@nubiia/mcp-newsapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![by Nubiia](https://img.shields.io/badge/by-Nubiia-6C4EE3)](https://nubiia.es)

A Model Context Protocol (MCP) server for [NewsAPI.ai](https://newsapi.ai) (the
[Event Registry](https://eventregistry.org) news intelligence API). It lets AI assistants
like Claude search news articles and **events** (clusters of articles about the same
happening), resolve names to entity URIs, see what is trending, and keep an eye on the
account's token budget.

> Built and maintained by **[Nubiia](https://nubiia.es)** — automatización e
> integraciones con IA para negocios (MCP, Holded, Pipedrive y más). ¿Quieres algo así
> para tu empresa? Escríbenos en **[nubiia.es](https://nubiia.es)**.

## ⚠️ NewsAPI.ai is metered in tokens

Every search spends **tokens** from your plan, and a free plan has a small budget. This
server is built to be frugal:

- Result counts default to **10** (articles/events) and article bodies to **300
  characters**, so a call is cheap in tokens *and* in your assistant's context window.
- Searches are limited to the **last 31 days** unless you pass `allow_archive: true`
  (historical data costs extra tokens per year touched). `allow_archive` **requires
  `date_start`** and the `date_start` → `date_end` (default: today) range may span **at
  most 1 year**. A `date_start`/`date_end` older than 31 days **without** `allow_archive`
  is rejected with an explanation instead of silently returning nothing.
- A search with **no filter at all is rejected** locally, before it can spend anything.
- A **session token budget** (default **200 tokens**, see below) stops runaway loops
  before they reach the API.
- The `suggest_*` tools and `get_usage` are **free** — use them to resolve entities to
  URIs *before* searching.
- `get_usage` shows the remaining budget.

Costs measured against a live account (31-day window):

| Tool | Tokens per call |
|---|---|
| `search_articles`, `get_article` | 1 |
| `search_events`, `get_event` (info) | 5 |
| `get_event` (`include_articles`) | 1 |
| `get_trending_concepts` | 10 |
| `suggest_*`, `get_usage` | 0 |

Plans and pricing change — see [newsapi.ai/pricing](https://newsapi.ai/pricing) and
[`docs/api-notes.md`](docs/api-notes.md).

## Features

Ten read-only tools:

- **Articles** (2): `search_articles`, `get_article`
- **Events** (2): `search_events`, `get_event`
- **Autosuggest** (4): `suggest_concepts`, `suggest_categories`, `suggest_sources`,
  `suggest_locations`
- **Trends** (1): `get_trending_concepts`
- **Account** (1): `get_usage`

**Total: 10 tools**, all marked `readOnlyHint: true` — nothing in this server writes to
NewsAPI.ai or anywhere else.

### What's deliberately out of scope for v1

Topic pages and saved searches, the analytics service (text categorization, sentiment
of arbitrary text), story clustering, article mentions, aggregation result types
(`conceptAggr`, `timeAggr`, …) and multi-tenant configuration.

## Installation

### Prerequisites

- Node.js 22.14 or higher
- A NewsAPI.ai account and API key, from **[newsapi.ai](https://newsapi.ai) → Dashboard**

### Install from npm

```bash
npm install -g @nubiia/mcp-newsapi
```

### Install from source

```bash
git clone https://github.com/nubiia-dev/mcp-newsapi.git
cd mcp-newsapi
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEWSAPI_AI_API_KEY` | Yes | Your NewsAPI.ai API key (Dashboard). Secret — never commit it. |
| `NEWSAPI_AI_MAX_TOKENS_PER_SESSION` | No | Max NewsAPI.ai tokens this server may spend per session (until the server process restarts). Default **200**. |

```bash
export NEWSAPI_AI_API_KEY=your_newsapi_ai_key
export NEWSAPI_AI_MAX_TOKENS_PER_SESSION=200   # optional
```

### Session token budget

The budget is **per server process**: each MCP client/server instance you start has its own
counter, so two clients configured with 200 can together spend 400. It resets on restart.

Every call is charged its measured token cost (see the table above) **before** it is
sent. When a call would exceed the remaining budget, the tool returns an error stating the
remaining and total budget and how to raise it — and **no request is sent to NewsAPI.ai**.
Free tools (`suggest_*`, `get_usage`) are never blocked. `get_usage` also reports the
session budget (`maxTokens`, `spentTokens`, `remainingTokens`) next to your account
balance. Calls the API rejects outright (4xx) are refunded; calls that fail after being
accepted (including HTTP 200 `{"error"}` bodies) stay charged, because the API bills them.
An invalid value (e.g. `abc`, `-5`) falls back to 200 with a warning on stderr; `0`
disables all paid calls.

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "newsapi": {
      "command": "npx",
      "args": ["-y", "@nubiia/mcp-newsapi@latest"],
      "env": {
        "NEWSAPI_AI_API_KEY": "your_newsapi_ai_key",
        "NEWSAPI_AI_MAX_TOKENS_PER_SESSION": "200"
      }
    }
  }
}
```

Or if installed from source:

```json
{
  "mcpServers": {
    "newsapi": {
      "command": "node",
      "args": ["/path/to/mcp-newsapi/dist/index.js"],
      "env": {
        "NEWSAPI_AI_API_KEY": "your_newsapi_ai_key"
      }
    }
  }
}
```

### Claude Code Configuration

```bash
claude mcp add newsapi --env NEWSAPI_AI_API_KEY=your_newsapi_ai_key -- npx -y @nubiia/mcp-newsapi@latest
```

### Troubleshooting

- **`sh: mcp-newsapi: command not found` when launching from inside this repo.** If you
  start Claude Code (or another MCP client) from the cloned repository directory,
  `npx @nubiia/mcp-newsapi` resolves the local `package.json` instead of the published
  package, and the `mcp-newsapi` binary is not on the `PATH`. Pin the registry version
  with `@latest` (as in the examples above), or launch the client from another directory.

## Tools

List parameters (`lang`, `concept_uris`, `category_uris`, `source_uris`, `location_uris`,
`ignore_source_uris`, `data_types`, `types`, `concept_types`) accept either a single string
or an array of strings: `"lang": "spa"` and `"lang": ["spa"]` are equivalent.

The recommended flow: **`suggest_*` (free) → `search_*` → `get_*`**.

### `suggest_concepts` · read-only · free

Resolve a name ("Telefónica", "Pedro Sánchez") to a concept URI. Pass the `uri` as
`concept_uris` to a search — far more precise than a keyword.

```json
{ "prefix": "Telefónica", "types": ["org"], "count": 3 }
```

> **Searching for a company, person, place or organisation?** Resolve it with
> `suggest_concepts` first and pass the returned `uri` as `concept_uris`. `keyword` is for
> free terms and topics and is noisy with common words: for example `keyword: "Telefónica"`
> in Spanish also matches the ordinary adjective "telefónica".

### `suggest_categories`, `suggest_sources`, `suggest_locations` · read-only · free

Same idea for categories (`news/Business`), publications (`bbc.co.uk`) and places.

### `search_articles` · read-only · 1 token

At least one of `keyword`, `concept_uris`, `category_uris`, `source_uris`,
`location_uris` is required. Defaults: 10 results, newest first, duplicates skipped,
last 31 days, 300-character bodies. Paginate with `page`; the response carries `total`
and `pages`.

```json
{
  "concept_uris": ["http://en.wikipedia.org/wiki/Telefónica"],
  "lang": ["spa"],
  "date_start": "2026-10-01",
  "count": 5
}
```

Dates must be real `YYYY-MM-DD` dates, `date_end` must not precede `date_start`, and the
archive rules above apply (`allow_archive` needs `date_start`, max 1 year).

Other options: `keyword_loc`, `keyword_search_mode`, `ignore_keyword`,
`ignore_source_uris`, `data_types` (`news`/`pr`/`blog`), `sort_by`
(`date`/`rel`/`sourceImportance`/`cosSim`), `min_sentiment`/`max_sentiment`,
`body_len`, `include_duplicates`, `allow_archive`.

### `get_article` · read-only · 1 token

One article by `article_uri`, with a longer body (`body_len`, default 3000).

### `search_events` · read-only · 5 tokens

Events: clusters of articles about the same happening, with title, short summary, date,
location, key concepts and article count. The right granularity for "what is happening
with X". `sort_by: "size"` surfaces the biggest stories; `min_articles_in_event` filters
noise.

### `get_event` · read-only · 5 tokens (1 with `include_articles`)

One event by `event_uri`, or — with `include_articles: true` — the articles covering it.

### `get_trending_concepts` · read-only · 10 tokens

People, organisations and places trending right now (last 2 days vs last 2 weeks) in
`news`, `social`, `pr` or `blog` (blog trends may be unavailable on some plans, and the failed call is still billed). The priciest tool: call it sparingly.

### `get_usage` · read-only · free

`availableTokens`, `usedTokens`, `remainingTokens`. Check it before a batch of searches.

## Rate limiting

A local guard stops runaway agent loops before they drain the token budget:

| Tool(s) | Limit |
|---|---|
| `search_articles`, `search_events`, `get_article`, `get_event` | 30 req/min |
| `get_trending_concepts` | 20 req/min |
| `suggest_*`, `get_usage` | 120 req/min |
| Everything else (default) | 60 req/min |

The API itself allows at most 5 simultaneous requests. `429`/`502`/`503`/`504` responses
and connection-refused/DNS errors are retried with backoff; ambiguous failures (timeouts,
connection resets) are **not**, because a metered request may already have been billed.
Each attempt times out after 30 seconds.

## Error messages

A `401`/`403` response includes an explanation, not just "Unauthorized": the key may be
wrong/revoked, or the account may be out of tokens (`get_usage` tells you which).
The API key is sent in the request body, never in a URL, and is redacted from every error
message (HTTP, network and JSON-parse errors alike).

## Development

```bash
npm install
npm run build
npm test              # runs entirely against mocks — no network, no API key
npm run test:coverage
npm run lint
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full workflow and
[`docs/api-notes.md`](docs/api-notes.md) for API behaviour verified against a live account.

## License

[MIT](LICENSE)

## Related

- [`@nubiia/mcp-holded`](https://github.com/nubiia-dev/mcp-holded) — MCP server for the
  Holded invoicing/accounting API.
- [`@nubiia/mcp-signaturit`](https://github.com/nubiia-dev/mcp-signaturit) — MCP server
  for the Signaturit e-signature API.
