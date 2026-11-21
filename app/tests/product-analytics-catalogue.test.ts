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
    const FUNNEL = [
      "onboarding_started",
      "onboarding_step_viewed",
      "onboarding_industry_screen_viewed",
      "onboarding_industry_continued",
      "onboarding_role_screen_viewed",
      "onboarding_role_continued",
      "onboarding_company_size_screen_viewed",
      "onboarding_company_size_continued",
      "onboarding_goal_screen_viewed",
      "onboarding_goal_continued",
      "onboarding_completed",
      "onboarding_goal_handoff",
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
    strictEqual(isProductEvent("agent_copied"), false);
    strictEqual(isProductEvent("not_an_event"), false);
    strictEqual(isProductEvent("toString"), false);
  });
});

describe("pickProductProps", () => {
  it("keeps the event's own properties and drops every other key", () => {
    deepStrictEqual(
      pickProductProps("skill_installed", {
        skill_slug: "opaque-slug",
        source: "github",
        agent_id: "opaque-id",
      }),
      { skill_slug: "opaque-slug", source: "github" },
    );
  });

  it("returns an empty payload for an event with no properties", () => {
    deepStrictEqual(pickProductProps("dictation_used", { source: "chat" }), {});
    deepStrictEqual(pickProductProps("session_started"), {});
  });

  it("keeps the onboarding funnel's one property per step", () => {
    deepStrictEqual(
      pickProductProps("onboarding_started", {
        source: "in_app_replay",
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
