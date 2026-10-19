import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getAccountTools } from '../tools/account.js';

describe('Account Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getAccountTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getAccountTools(client);
  });

  describe('get_usage', () => {
    it('fetches usage and computes the remaining tokens', async () => {
      (client.post as any).mockResolvedValue({ availableTokens: 2000, usedTokens: 39 });

      const result = (await tools.get_usage.handler({})) as Record<string, number>;

      expect(client.post).toHaveBeenCalledWith('/api/v1/usage');
      expect(result).toEqual({ availableTokens: 2000, usedTokens: 39, remainingTokens: 1961 });
    });

    it('never reports negative remaining tokens', async () => {
      (client.post as any).mockResolvedValue({ availableTokens: 10, usedTokens: 12 });
      const result = (await tools.get_usage.handler({})) as { remainingTokens: number };
      expect(result.remainingTokens).toBe(0);
    });

    it('is marked readOnlyHint', () => {
      expect(tools.get_usage.readOnlyHint).toBe(true);
    });
  });
});
