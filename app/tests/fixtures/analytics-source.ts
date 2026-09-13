// `analytics.ts` can't be imported from a test (posthog-js comes with it), so
// its vocabulary is read out of the source instead. Shared by every test that
// asserts a contract against the tracked-event catalogue.
//
// The block boundaries are the NEXT declaration, never a bare `";\n"`: the
// unions are full of prose comments, and one of them ends a sentence with a
// semicolon — which silently cut the event list off halfway and made every
// assertion about a name below that line pass by reading an empty set.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ANALYTICS_SOURCE = readFileSync(
  join(import.meta.dirname, "../../src/lib/analytics.ts"),
  "utf8",
);

/** The source between two anchors, asserting both still exist. */
export function analyticsBlock(startsWith: string, endsWith: string): string {
  const from = ANALYTICS_SOURCE.indexOf(startsWith);
  if (from < 0) throw new Error(`analytics.ts no longer has "${startsWith}"`);
  const to = ANALYTICS_SOURCE.indexOf(endsWith, from + startsWith.length);
  if (to < 0) throw new Error(`analytics.ts no longer has "${endsWith}"`);
  return ANALYTICS_SOURCE.slice(from, to);
}

const quoted = (source: string) =>
  new Set(Array.from(source.matchAll(/"([a-z0-9_$]+)"/g), (m) => m[1]));

/** Every name `analytics.track` accepts. */
export const TRACKED_EVENTS = quoted(
  analyticsBlock(
    "export type AnalyticsEventName =",
    "export type AnalyticsProperty =",
  ),
);

/** Every property name the type union declares. */
export const TRACKED_PROPERTY_UNION = quoted(
  analyticsBlock("export type AnalyticsProperty =", "type Props ="),
);

/** The properties `cleanProps` keeps; anything else is dropped silently. */
export const TRACKED_ALLOWED_PROPS = quoted(
  analyticsBlock("const ALLOWED_PROPS = new Set<AnalyticsProperty>([", "]);"),
);
