/**
 * Provider-agnostic domain model returned by the tools. Deliberately smaller
 * than Event Registry's wire format: these objects are consumed by an LLM, so
 * every field earns its place (tokens matter as much as API credits do).
 */

export interface SourceRef {
  uri: string;
  title?: string;
}

export interface ConceptRef {
  uri: string;
  label?: string;
  type?: string;
}

export interface Article {
  uri: string;
  title?: string;
  /** Article body, truncated to the requested `body_len`. */
  body?: string;
  url?: string;
  /** ISO 8601 publication datetime (UTC) when available, else the date. */
  published?: string;
  lang?: string;
  source?: SourceRef;
  authors?: string[];
  /** Sentiment in [-1, 1]; English articles only. */
  sentiment?: number;
  image?: string;
  eventUri?: string;
  isDuplicate?: boolean;
}

export interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  pages?: number;
}

export interface NewsEvent {
  uri: string;
  title?: string;
  summary?: string;
  eventDate?: string;
  totalArticleCount?: number;
  location?: string;
  concepts?: ConceptRef[];
  categories?: string[];
  sentiment?: number;
}

export interface Suggestion {
  uri?: string;
  label?: string;
  type?: string;
  /** Extra provider detail useful for disambiguation (e.g. source URL, parent country). */
  detail?: string;
}

export interface TrendingConcept extends ConceptRef {
  score?: number;
}

export interface UsageInfo {
  availableTokens?: number;
  usedTokens?: number;
  remainingTokens?: number;
  planName?: string;
}
