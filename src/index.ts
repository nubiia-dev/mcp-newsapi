#!/usr/bin/env node

import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { RateLimiter } from './utils/rate-limiter.js';
import { BUDGET_ENV_VAR, TokenBudget, parseBudgetEnv } from './utils/token-budget.js';
import { NewsApiClient } from './newsapi-client.js';
import { getArticleTools } from './tools/articles.js';
import { getEventTools } from './tools/events.js';
import { getSuggestTools } from './tools/suggest.js';
import { getTrendTools } from './tools/trends.js';
import { getAccountTools } from './tools/account.js';

// The version is read from package.json at runtime: hard-coded here it drifts as soon as
// semantic-release publishes, and MCP clients would see a number that does not match the
// installed package.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const apiKey = process.env.NEWSAPI_AI_API_KEY ?? '';

const budgetConfig = parseBudgetEnv(process.env[BUDGET_ENV_VAR]);
if (budgetConfig.warning) {
  console.error(`Warning: ${budgetConfig.warning}`);
}
/** Token-weighted spending cap for this server process; see utils/token-budget.ts. */
const budget = new TokenBudget(budgetConfig.value);

let client: NewsApiClient;
try {
  client = new NewsApiClient(apiKey, { budget });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/**
 * Per-tool rate limits. NewsAPI.ai bills tokens per search, so the token-
 * consuming tools get a tighter local budget than the free suggest/usage
 * tools: a runaway agent loop should hit this guard before it drains the
 * account's monthly token allowance.
 */
const rateLimiter = new RateLimiter({
  maxRequests: 60, // default: 60 requests/min
  windowMs: 60000,
  toolLimits: {
    search_articles: { maxRequests: 30, windowMs: 60000 },
    search_events: { maxRequests: 30, windowMs: 60000 },
    get_article: { maxRequests: 30, windowMs: 60000 },
    get_event: { maxRequests: 30, windowMs: 60000 },
    get_trending_concepts: { maxRequests: 20, windowMs: 60000 },
    // Free endpoints get a more generous budget.
    suggest_concepts: { maxRequests: 120, windowMs: 60000 },
    suggest_categories: { maxRequests: 120, windowMs: 60000 },
    suggest_sources: { maxRequests: 120, windowMs: 60000 },
    suggest_locations: { maxRequests: 120, windowMs: 60000 },
    get_usage: { maxRequests: 120, windowMs: 60000 },
  },
});

const allTools = {
  ...getArticleTools(client),
  ...getEventTools(client),
  ...getSuggestTools(client),
  ...getTrendTools(client),
  ...getAccountTools(client),
};

const server = new Server(
  {
    name: 'mcp-newsapi',
    version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: 'readOnlyHint' in tool ? tool.readOnlyHint : false },
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = allTools[name as keyof typeof allTools];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const rateLimit = await rateLimiter.checkLimit(name);
  if (!rateLimit.allowed) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Rate limit exceeded',
            message: `Too many requests for tool '${name}'. Please retry after ${rateLimit.retryAfter} seconds.`,
            retryAfter: rateLimit.retryAfter,
            resetTime: rateLimit.resetTime,
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(args as never);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `NewsAPI.ai MCP Server ${version} running on stdio (session budget: ${budget.max} tokens)`
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
