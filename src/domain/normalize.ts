/**
 * Wire format (Event Registry JSON) → domain model translation.
 *
 * Event Registry payloads are large and multilingual (labels arrive as
 * `{ eng: "...", spa: "..." }`). These functions are the ONLY place allowed to
 * reach into that shape with access on `unknown` records — everything
 * downstream works against `domain/types.ts`.
 *
 * Kept deliberately defensive: every field access tolerates missing keys, and
 * fields that could not be found are omitted from the normalized object.
 */
import type {
  Article,
  ConceptRef,
  NewsEvent,
  Page,
  SourceRef,
  Suggestion,
  TrendingConcept,
  UsageInfo,
} from './types.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Removes keys whose value is `undefined` so serialized output stays compact. */
function compact<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/** Truncates text to `max` characters, appending an ellipsis when cut. */
export function truncate(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

/**
 * Picks a human label from either a plain string or a `{ eng: "...", spa: "..." }`
 * multilingual map. Prefers English, then Spanish, then whatever is first.
 */
export function pickLabel(value: unknown): string | undefined {
  if (typeof value === 'string') return asString(value);
  const map = asRecord(value);
  return asString(map.eng) ?? asString(map.spa) ?? asString(Object.values(map)[0]);
}

export function normalizeSource(wire: unknown): SourceRef | undefined {
  const r = asRecord(wire);
  const uri = asString(r.uri);
  if (!uri) return undefined;
  return compact({ uri, title: asString(r.title) });
}

export function normalizeConcept(wire: unknown): ConceptRef | undefined {
  const r = asRecord(wire);
  const uri = asString(r.uri);
  if (!uri) return undefined;
  return compact({ uri, label: pickLabel(r.label), type: asString(r.type) });
}

/** Normalizes one entry of `articles.results[]` (or `<uri>.info` of getArticle). */
export function normalizeArticle(wire: unknown, bodyLen = 300): Article {
  const r = asRecord(wire);
  const authors = asArray(r.authors)
    .map((a) => asString(asRecord(a).name))
    .filter((n): n is string => n !== undefined);
  return compact({
    uri: asString(r.uri) ?? '',
    title: asString(r.title),
    body: truncate(asString(r.body), bodyLen),
    url: asString(r.url),
    published: asString(r.dateTimePub) ?? asString(r.dateTime) ?? asString(r.date),
    lang: asString(r.lang),
    source: normalizeSource(r.source),
    authors: authors.length > 0 ? authors : undefined,
    sentiment: asNumber(r.sentiment),
    image: asString(r.image),
    eventUri: asString(r.eventUri),
    isDuplicate: r.isDuplicate === true ? true : undefined,
  });
}

/** Normalizes the `articles` result block (`{ results, totalResults, page, pages }`). */
export function normalizeArticlePage(wire: unknown, bodyLen = 300): Page<Article> {
  const block = asRecord(asRecord(wire).articles);
  return compact({
    items: asArray(block.results).map((a) => normalizeArticle(a, bodyLen)),
    total: asNumber(block.totalResults),
    page: asNumber(block.page),
    pages: asNumber(block.pages),
  });
}

/** Normalizes a single event (from `events.results[]` or `<uri>.info`). */
export function normalizeEvent(wire: unknown, summaryLen = 300): NewsEvent {
  const r = asRecord(wire);
  const concepts = asArray(r.concepts)
    .map(normalizeConcept)
    .filter((c): c is ConceptRef => c !== undefined)
    .slice(0, 8);
  const categories = asArray(r.categories)
    .map((c) => asString(asRecord(c).label) ?? asString(asRecord(c).uri))
    .filter((c): c is string => c !== undefined)
    .slice(0, 5);
  return compact({
    uri: asString(r.uri) ?? '',
    title: pickLabel(r.title),
    summary: truncate(pickLabel(r.summary), summaryLen),
    eventDate: asString(r.eventDate),
    totalArticleCount: asNumber(r.totalArticleCount),
    location: pickLabel(asRecord(r.location).label),
    concepts: concepts.length > 0 ? concepts : undefined,
    categories: categories.length > 0 ? categories : undefined,
    sentiment: asNumber(r.sentiment),
  });
}

export function normalizeEventPage(wire: unknown, summaryLen = 300): Page<NewsEvent> {
  const block = asRecord(asRecord(wire).events);
  return compact({
    items: asArray(block.results).map((e) => normalizeEvent(e, summaryLen)),
    total: asNumber(block.totalResults),
    page: asNumber(block.page),
    pages: asNumber(block.pages),
  });
}

/**
 * Normalizes any `suggest*Fast` item. Concepts/categories/sources/locations
 * all share a loose `{ uri | wikiUri, label | title, type }` shape.
 */
export function normalizeSuggestion(wire: unknown): Suggestion {
  const r = asRecord(wire);
  const country = pickLabel(asRecord(r.country).label);
  return compact({
    uri: asString(r.uri) ?? asString(r.wikiUri),
    label: pickLabel(r.label) ?? asString(r.title),
    type: asString(r.type) ?? asString(r.dataType),
    detail: asString(r.url) ?? country,
  });
}

export function normalizeSuggestions(wire: unknown): { items: Suggestion[] } {
  return { items: asArray(wire).map(normalizeSuggestion) };
}

export function normalizeTrendingConcept(wire: unknown): TrendingConcept {
  const r = asRecord(wire);
  const trend = asRecord(r.trendingScore);
  return compact({
    ...(normalizeConcept(r) ?? { uri: '' }),
    score: asNumber(r.score) ?? asNumber(trend.score) ?? asNumber(r.trendingScore),
  });
}

/** Extracts the trending list from the various shapes the trends endpoint may use. */
export function normalizeTrendingConcepts(wire: unknown): { items: TrendingConcept[] } {
  const r = asRecord(wire);
  const list = Array.isArray(wire) ? wire : asArray(r.trendingConcepts ?? r.concepts ?? r.results);
  return { items: list.map(normalizeTrendingConcept) };
}

export function normalizeUsage(wire: unknown): UsageInfo {
  const r = asRecord(wire);
  const available = asNumber(r.availableTokens) ?? asNumber(r.availableTokensForPlan);
  const used = asNumber(r.usedTokens);
  return compact({
    availableTokens: available,
    usedTokens: used,
    remainingTokens:
      available !== undefined && used !== undefined ? Math.max(available - used, 0) : undefined,
    planName: asString(r.planName),
  });
}
