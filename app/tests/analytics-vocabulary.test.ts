import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  TRACKED_ALLOWED_PROPS as ALLOWED_PROPS,
  TRACKED_EVENTS as EVENTS,
  TRACKED_PROPERTY_UNION as PROPERTY_UNION,
} from "./fixtures/analytics-source.ts";

describe("the analytics vocabulary the tests read", () => {
  it("reads the event names from the union's first line to its last", () => {
    ok(EVENTS.has("app_active"), "the first name in the union is missing");
    ok(EVENTS.has("perf_span"), "the union is being read only halfway");
  });

  it("reads the property union and the allow-list end to end", () => {
    ok(PROPERTY_UNION.has("provider"), "the property union's first name");
    ok(PROPERTY_UNION.has("duration_ms"), "the property union's last name");
    ok(ALLOWED_PROPS.has("provider"), "the allow-list's first entry");
    ok(ALLOWED_PROPS.has("duration_ms"), "the allow-list's last entry");
  });

  it("keeps every allowed property declared in the union", () => {
    for (const prop of ALLOWED_PROPS) {
      ok(PROPERTY_UNION.has(prop), `AnalyticsProperty is missing "${prop}"`);
    }
  });
});
