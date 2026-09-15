// `analytics.ts` and the vocabulary it re-exports can't be imported from a test
// (posthog-js comes with the first, and the rest are what it re-exports — all
// of them are read as source so one reader covers them), so the vocabulary is
// read out of the source instead. Shared by every test that asserts a contract
// against the tracked-event catalogue.
//
// The block boundaries are the NEXT declaration, never a bare `";\n"`: the
// unions are full of prose comments, and one of them ends a sentence with a
// semicolon — which silently cut the event list off halfway and made every
// assertion about a name below that line pass by reading an empty set. The
// event-name union is a whole file, so it needs no end anchor at all.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(import.meta.dirname, "../../src/lib", name), "utf8");

/** `analytics.ts` itself: the PostHog call sites (`track`, person props). */
export const ANALYTICS_SOURCE = read("analytics.ts");
/** Every name `analytics.track` accepts — one union, one file. */
const EVENT_NAMES_SOURCE = read("analytics-event-names.ts");
/** The property union and the allow-list `cleanProps` enforces. */
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

/** The source from an anchor to the end of the file, asserting it exists. */
function fromAnchor(source: string, file: string, startsWith: string): string {
  const start = source.indexOf(startsWith);
  if (start < 0) throw new Error(`${file} no longer has "${startsWith}"`);
  return source.slice(start);
}

/** The `analytics.ts` source between two anchors, asserting both still exist. */
export function analyticsBlock(startsWith: string, endsWith: string): string {
  return between(ANALYTICS_SOURCE, "analytics.ts", startsWith, endsWith);
}

const vocabularyBlock = (startsWith: string, endsWith: string) =>
  between(VOCABULARY_SOURCE, "analytics-vocabulary.ts", startsWith, endsWith);

const quoted = (source: string) =>
  new Set(Array.from(source.matchAll(/"([a-z0-9_$]+)"/g), (m) => m[1]));

/** Every name `analytics.track` accepts. */
export const TRACKED_EVENTS = quoted(
  fromAnchor(
    EVENT_NAMES_SOURCE,
    "analytics-event-names.ts",
    "export type AnalyticsEventName =",
  ),
);

/** Every property name the type union declares. */
export const TRACKED_PROPERTY_UNION = quoted(
  vocabularyBlock(
    "export type AnalyticsProperty =",
    "export const ALLOWED_PROPS",
  ),
);

/** The properties `cleanProps` keeps; anything else is dropped silently. */
export const TRACKED_ALLOWED_PROPS = quoted(
  vocabularyBlock(
    "export const ALLOWED_PROPS = new Set<AnalyticsProperty>([",
    "]);",
  ),
);
