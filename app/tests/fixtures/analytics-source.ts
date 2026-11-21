import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(import.meta.dirname, "../../src/lib", name), "utf8");

export const ANALYTICS_SOURCE = read("analytics.ts");
const EVENT_NAMES_SOURCE = read("analytics-event-names.ts");
const VOCABULARY_SOURCE = read("analytics-vocabulary.ts");

function between(
  source: string,
  file: string,
  startsWith: string,
  endsWith: string,
): string {
  const start = source.indexOf(startsWith);
  if (start < 0) throw new Error(`${file} no longer has "${startsWith}"`);
  const to = source.indexOf(endsWith, start + startsWith.length);
  if (to < 0) throw new Error(`${file} no longer has "${endsWith}"`);
  return source.slice(start, to);
}

function fromAnchor(source: string, file: string, startsWith: string): string {
  const start = source.indexOf(startsWith);
  if (start < 0) throw new Error(`${file} no longer has "${startsWith}"`);
  return source.slice(start);
}

export function analyticsBlock(startsWith: string, endsWith: string): string {
  return between(ANALYTICS_SOURCE, "analytics.ts", startsWith, endsWith);
}

const vocabularyBlock = (startsWith: string, endsWith: string) =>
  between(VOCABULARY_SOURCE, "analytics-vocabulary.ts", startsWith, endsWith);

const quoted = (source: string) =>
  new Set(Array.from(source.matchAll(/"([a-z0-9_$]+)"/g), (m) => m[1]));

export const TRACKED_EVENTS = quoted(
  fromAnchor(
    EVENT_NAMES_SOURCE,
    "analytics-event-names.ts",
    "export type AnalyticsEventName =",
  ),
);

export const TRACKED_PROPERTY_UNION = quoted(
  vocabularyBlock(
    "export type AnalyticsProperty =",
    "export const ALLOWED_PROPS",
  ),
);

export const TRACKED_ALLOWED_PROPS = quoted(
  vocabularyBlock(
    "export const ALLOWED_PROPS = new Set<AnalyticsProperty>([",
    "]);",
  ),
);
