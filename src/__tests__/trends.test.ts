import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getTrendTools } from '../tools/trends.js';

describe('Trend Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getTrendTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getTrendTools(client);
  });

  describe('get_trending_concepts', () => {
    it('requests the top 10 news concepts of the default kinds', async () => {
      (client.post as any).mockResolvedValue([
        { uri: 'u1', type: 'person', label: { eng: 'Jane' }, score: 7.5 },
      ]);

      const result = (await tools.get_trending_concepts.handler({})) as unknown as {
        items: Array<Record<string, unknown>>;
      };

      expect(client.post).toHaveBeenCalledWith('/api/v1/trends/getTrendingConcepts', {
        action: 'getTrendingConcepts',
        source: 'news',
        dataType: 'news',
        conceptCount: 10,
        conceptType: ['person', 'org', 'loc'],
      });
      expect(result.items).toEqual([{ uri: 'u1', label: 'Jane', type: 'person', score: 7.5 }]);
    });

    it('omits dataType for the social source', async () => {
      await tools.get_trending_concepts.handler({ source: 'social', count: 3 });
      const [, body] = (client.post as any).mock.calls[0];
      expect(body.dataType).toBeUndefined();
      expect(body.source).toBe('social');
      expect(body.conceptCount).toBe(3);
    });

    it('accepts an object-wrapped list', async () => {
      (client.post as any).mockResolvedValue({ trendingConcepts: [{ uri: 'u', label: 'L' }] });
      const result = (await tools.get_trending_concepts.handler({})) as { items: unknown[] };
      expect(result.items).toHaveLength(1);
    });

    it("accepts the 'blog' source and rejects the invalid 'blogs'", async () => {
      await tools.get_trending_concepts.handler({ source: 'blog' });
      const [, body] = (client.post as any).mock.calls[0];
      expect(body.source).toBe('blog');
      expect(body.dataType).toBe('blog');
      await expect(tools.get_trending_concepts.handler({ source: 'blogs' })).rejects.toThrow(
        /Validation error/
      );
    });

    it('rejects count above 50', async () => {
      await expect(tools.get_trending_concepts.handler({ count: 51 })).rejects.toThrow(
        /Validation error/
      );
    });

    it('is marked readOnlyHint', () => {
      expect(tools.get_trending_concepts.readOnlyHint).toBe(true);
    });
  });
});
