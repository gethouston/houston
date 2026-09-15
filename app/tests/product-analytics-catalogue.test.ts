import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isProductEvent,
  PRODUCT_EVENTS,
  pickProductProps,
  SERVER_OWNED_EVENTS,
} from "../src/lib/product-analytics/catalogue.ts";
import {
  TRACKED_ALLOWED_PROPS as ALLOWED_PROPS,
  TRACKED_EVENTS as EVENTS,
} from "./fixtures/analytics-source.ts";

// The table types itself against `AnalyticsEventName` / `AnalyticsProperty`, so
// the compiler already refuses a name or a property key that does not exist.
// What it cannot see is `ALLOWED_PROPS`: these properties reach us through the
// same call sites PostHog's `cleanProps` filters, and a key missing from that
// Set is dropped there silently.

const NAMES = Object.keys(PRODUCT_EVENTS) as Array<keyof typeof PRODUCT_EVENTS>;

describe("product analytics catalogue", () => {
  it("gathers only properties the tracked call sites keep", () => {
    ok(NAMES.length > 0);
    for (const name of NAMES) {
      for (const prop of PRODUCT_EVENTS[name].props) {
        ok(ALLOWED_PROPS.has(prop), `ALLOWED_PROPS is missing "${prop}"`);
      }
    }
  });

  it("gathers the whole first-run funnel", () => {
    // The steps between "the app opened" and "onboarding finished" are the
    // funnel activation is read from: a name dropped here turns one stage of
    // it into a silent gap that nothing in the app would ever complain about.
    const FUNNEL = [
      "onboarding_started",
      "onboarding_step_viewed",
      "onboarding_agreement_accepted",
      "onboarding_segment_screen_viewed",
      "onboarding_segment_continued",
      "onboarding_industry_screen_viewed",
      "onboarding_industry_continued",
      "onboarding_goal_screen_viewed",
      "onboarding_goal_continued",
      "onboarding_completed",
    ] as const;
    for (const name of FUNNEL) {
      strictEqual(
        isProductEvent(name),
        true,
        `"${name}" is no longer gathered`,
      );
    }
  });

  it("leaves the server-owned facts to the server", () => {
    for (const name of SERVER_OWNED_EVENTS) {
      ok(EVENTS.has(name), `AnalyticsEventName is missing "${name}"`);
      strictEqual(
        isProductEvent(name),
        false,
        `"${name}" is the gateway's to write, never the client's`,
      );
    }
  });

  it("explains every gathered event in one sentence", () => {
    for (const name of NAMES) {
      const { definition } = PRODUCT_EVENTS[name];
      ok(definition.length > 10, `"${name}" has no definition`);
      ok(definition.endsWith("."), `"${name}" definition is not a sentence`);
    }
  });

  it("recognizes nothing outside the table", () => {
    strictEqual(isProductEvent("agent_created"), true);
    strictEqual(isProductEvent("agent_published"), false);
    strictEqual(isProductEvent("not_an_event"), false);
    strictEqual(isProductEvent("toString"), false);
  });
});

describe("pickProductProps", () => {
  it("keeps the event's own properties and drops every other key", () => {
    deepStrictEqual(
      pickProductProps("agent_installed_from_store", {
        agent_slug: "opaque-slug",
        source: "store",
        // Tracked on the same call, but not part of what this event gathers.
        agent_id: "opaque-id",
      }),
      { agent_slug: "opaque-slug", source: "store" },
    );
  });

  it("returns an empty payload for an event with no properties", () => {
    deepStrictEqual(pickProductProps("dictation_used", { source: "chat" }), {});
    deepStrictEqual(pickProductProps("session_started"), {});
    deepStrictEqual(pickProductProps("onboarding_agreement_accepted"), {});
  });

  it("keeps the onboarding funnel's one property per step", () => {
    deepStrictEqual(
      pickProductProps("onboarding_started", {
        source: "in_app_replay",
        // The same call site's PostHog payload carries more; this is the only
        // key the funnel reads, so it is the only one that leaves the device.
        step: "welcome",
      }),
      { source: "in_app_replay" },
    );
    deepStrictEqual(
      pickProductProps("onboarding_step_viewed", { step: "connect_ai" }),
      { step: "connect_ai" },
    );
    deepStrictEqual(
      pickProductProps("onboarding_industry_screen_viewed", {
        source_screen: "profile_prompt",
      }),
      { source_screen: "profile_prompt" },
    );
  });

  it("keeps booleans and finite numbers, drops everything unsendable", () => {
    deepStrictEqual(
      pickProductProps("onboarding_goal_continued", {
        goal_provided: true,
        source_screen: undefined,
      }),
      { goal_provided: true },
    );
    deepStrictEqual(
      pickProductProps("app_error_shown", { error_kind: Number.NaN }),
      {},
    );
    deepStrictEqual(
      pickProductProps("app_error_shown", {
        error_kind: { kind: "network" },
      }),
      {},
    );
  });

  it("truncates a runaway string instead of losing the event", () => {
    const picked = pickProductProps("tab_opened", {
      tab_name: "x".repeat(2000),
    });
    strictEqual(picked.tab_name, "x".repeat(512));
  });
});
