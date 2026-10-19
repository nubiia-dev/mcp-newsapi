import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_TOKENS_PER_SESSION,
  TokenBudget,
  parseBudgetEnv,
  tokenCost,
} from '../utils/token-budget.js';

describe('tokenCost', () => {
  it.each([
    ['/api/v1/article/getArticles', {}, 1],
    ['/api/v1/article/getArticle', {}, 1],
    ['/api/v1/event/getEvents', {}, 5],
    ['/api/v1/event/getEvent', { resultType: 'info' }, 5],
    ['/api/v1/event/getEvent', { resultType: 'articles' }, 1],
    ['/api/v1/trends/getTrendingConcepts', {}, 10],
    ['/api/v1/suggestConceptsFast', {}, 0],
    ['/api/v1/suggestCategoriesFast', {}, 0],
    ['/api/v1/suggestSourcesFast', {}, 0],
    ['/api/v1/suggestLocationsFast', {}, 0],
    ['/api/v1/usage', {}, 0],
    ['/api/v1/somethingNew', {}, 1],
  ])('%s %j costs %i', (endpoint, body, cost) => {
    expect(tokenCost(endpoint, body)).toBe(cost);
  });
});

describe('parseBudgetEnv', () => {
  it('defaults to 200 when unset or blank', () => {
    expect(parseBudgetEnv(undefined)).toEqual({ value: 200 });
    expect(parseBudgetEnv('  ')).toEqual({ value: DEFAULT_MAX_TOKENS_PER_SESSION });
  });

  it('parses a non-negative integer, including 0', () => {
    expect(parseBudgetEnv('500').value).toBe(500);
    expect(parseBudgetEnv('0').value).toBe(0);
  });

  it('falls back to the default with a warning on garbage', () => {
    for (const bad of ['abc', '-5', '1.5', '10 tokens']) {
      const r = parseBudgetEnv(bad);
      expect(r.value).toBe(200);
      expect(r.warning).toMatch(/NEWSAPI_AI_MAX_TOKENS_PER_SESSION/);
    }
  });
});

describe('TokenBudget', () => {
  it('tracks spent and remaining tokens', () => {
    const b = new TokenBudget(10);
    b.charge(4);
    expect(b.spentTokens).toBe(4);
    expect(b.remainingTokens).toBe(6);
  });

  it('refuses a charge that exceeds the remainder without spending anything', () => {
    const b = new TokenBudget(5);
    b.charge(3);
    expect(() => b.charge(3)).toThrow(/only 2 of 5 remain/);
    expect(b.spentTokens).toBe(3);
  });

  it('allows a zero-cost charge even at zero budget', () => {
    expect(() => new TokenBudget(0).charge(0)).not.toThrow();
  });

  it('refunds, never below zero', () => {
    const b = new TokenBudget(10);
    b.charge(2);
    b.refund(5);
    expect(b.spentTokens).toBe(0);
  });
});
