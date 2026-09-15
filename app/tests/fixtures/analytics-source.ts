// `analytics.ts` and `analytics-vocabulary.ts` can't be imported from a test
// (posthog-js comes with the first, and the second is what the first re-exports
// — both are read as source so one reader covers them), so the vocabulary is
// read out of the source instead. Shared by every test that asserts a contract
// against the tracked-event catalogue.
//
// The block boundaries are the NEXT declaration, never a bare `";\n"`: the
// unions are full of prose comments, and one of them ends a sentence with a
// semicolon — which silently cut the event list off halfway and made every
// assertion about a name below that line pass by reading an empty set.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(import.meta.dirname, "../../src/lib", name), "utf8");

/** `analytics.ts` itself: the PostHog call sites (`track`, person props). */
export const ANALYTICS_SOURCE = read("analytics.ts");
/** The vocabulary the app tracks: both unions and the property allow-list. */
const VOCABULARY_SOURCE = read("analytics-vocabulary.ts");

function between(
  source: string,
  file: string,
  startsWith: string,
  endsWith: string,
): string {
  const from = source.indexOf(startsWith);
  if (from < 0) throw new Error(`${file} no longer has "${startsWith}"`);
  const to = source.indexOf(endsWith, from + startsWith.length);
  if (to < 0) throw new Error(`${file} no longer has "${endsWith}"`);
  return source.slice(from, to);
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
  vocabularyBlock(
    "export type AnalyticsEventName =",
    "export type AnalyticsProperty =",
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
