import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// `analytics.ts` can't be imported here (posthog-js + the engine client come
// with it), so the survey's contract with PostHog is asserted against the
// source. Two things must hold or the dashboards go quiet: every survey event
// is in the AnalyticsEventName union (typos fail the build, absences don't),
// and every survey prop is in BOTH the property union and ALLOWED_PROPS —
// `cleanProps` drops anything missing from the Set, silently.
const SOURCE = readFileSync(
  join(import.meta.dirname, "../src/lib/analytics.ts"),
  "utf8",
);

function block(startsWith: string, endsWith: string): string {
  const from = SOURCE.indexOf(startsWith);
  ok(from >= 0, `analytics.ts no longer contains "${startsWith}"`);
  const to = SOURCE.indexOf(endsWith, from);
  ok(to > from, `analytics.ts no longer contains "${endsWith}"`);
  return SOURCE.slice(from, to);
}

const quoted = (source: string) =>
  new Set(Array.from(source.matchAll(/"([a-z0-9_$]+)"/g), (m) => m[1]));

const EVENTS = quoted(block("export type AnalyticsEventName =", ";\n"));
const PROPERTY_UNION = quoted(block("type AnalyticsProperty =", ";\n"));
const ALLOWED_PROPS = quoted(
  block("const ALLOWED_PROPS = new Set<AnalyticsProperty>([", "]);"),
);

describe("onboarding survey analytics", () => {
  it("declares every survey event", () => {
    for (const event of [
      "onboarding_industry_screen_viewed",
      "onboarding_industry_selected",
      "onboarding_industry_continued",
      "onboarding_goal_screen_viewed",
      "onboarding_goal_continued",
      "onboarding_survey_prompted",
    ]) {
      ok(EVENTS.has(event), `AnalyticsEventName is missing "${event}"`);
    }
  });

  it("whitelists every survey event property", () => {
    for (const prop of [
      "selected_industry",
      "goal_provided",
      "missing_steps",
    ]) {
      ok(PROPERTY_UNION.has(prop), `AnalyticsProperty is missing "${prop}"`);
      ok(ALLOWED_PROPS.has(prop), `ALLOWED_PROPS is missing "${prop}"`);
    }
  });

  it("keeps the goal text OUT of event payloads", () => {
    // Free text the user wrote: it may only reach the person property, never an
    // event. Leaving it out of ALLOWED_PROPS is what enforces that.
    ok(PROPERTY_UNION.has("goal_text"));
    strictEqual(ALLOWED_PROPS.has("goal_text"), false);
  });

  it("stamps the answers as person properties on the Continue beat", () => {
    const track = block(
      "track: (event: AnalyticsEventName",
      "trackAiGeneration",
    );
    ok(track.includes('event === "onboarding_industry_continued"'));
    ok(track.includes("onboarding_industry: props.selected_industry"));
    ok(track.includes('event === "onboarding_goal_continued"'));
    ok(track.includes("props.goal_text.slice(0, GOAL_PERSON_PROP_MAX)"));
    ok(track.includes('"skipped"'));
    ok(track.includes("onboarding_automation_goal: goal"));
    ok(SOURCE.includes("const GOAL_PERSON_PROP_MAX = 500;"));
  });
});
