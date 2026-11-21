import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  TRACKED_ALLOWED_PROPS as ALLOWED_PROPS,
  analyticsBlock as block,
  TRACKED_EVENTS as EVENTS,
  TRACKED_PROPERTY_UNION as PROPERTY_UNION,
  ANALYTICS_SOURCE as SOURCE,
} from "./fixtures/analytics-source.ts";

describe("onboarding survey analytics", () => {
  it("declares every survey event", () => {
    for (const event of [
      "onboarding_industry_screen_viewed",
      "onboarding_industry_selected",
      "onboarding_industry_continued",
      "onboarding_role_screen_viewed",
      "onboarding_role_selected",
      "onboarding_role_continued",
      "onboarding_company_size_screen_viewed",
      "onboarding_company_size_continued",
      "onboarding_goal_screen_viewed",
      "onboarding_goal_continued",
      "onboarding_survey_prompted",
    ]) {
      ok(EVENTS.has(event), `AnalyticsEventName is missing "${event}"`);
    }
  });

  it("retires the department question's events", () => {
    for (const event of [
      "onboarding_segment_screen_viewed",
      "onboarding_segment_selected",
      "onboarding_segment_continued",
    ]) {
      strictEqual(EVENTS.has(event), false, `"${event}" is still declared`);
    }
    strictEqual(PROPERTY_UNION.has("selected_segment"), false);
  });

  it("whitelists every survey event property", () => {
    for (const prop of [
      "selected_industry",
      "selected_role",
      "selected_company_size",
      "goal_provided",
      "missing_steps",
    ]) {
      ok(PROPERTY_UNION.has(prop), `AnalyticsProperty is missing "${prop}"`);
      ok(ALLOWED_PROPS.has(prop), `ALLOWED_PROPS is missing "${prop}"`);
    }
  });

  it("keeps the goal text OUT of event payloads", () => {
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
    ok(track.includes('event === "onboarding_role_continued"'));
    ok(track.includes("onboarding_role: props.selected_role"));
    ok(track.includes('event === "onboarding_company_size_continued"'));
    ok(track.includes("onboarding_company_size: props.selected_company_size"));
    ok(track.includes('event === "onboarding_goal_continued"'));
    ok(track.includes("props.goal_text.slice(0, GOAL_PERSON_PROP_MAX)"));
    ok(track.includes('"skipped"'));
    ok(track.includes("onboarding_automation_goal: goal"));
    ok(SOURCE.includes("const GOAL_PERSON_PROP_MAX = 500;"));
  });
});
