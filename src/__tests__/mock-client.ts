import { vi } from 'vitest';
import { NewsApiClient } from '../newsapi-client.js';

export function createMockClient() {
  const client = new NewsApiClient('test-api-key');

  vi.spyOn(client, 'post').mockResolvedValue({});

  return client;
}
