// The vocabulary every contract test downstream asserts against is READ OUT OF
// SOURCE (posthog-js cannot be imported here), so those tests are only as good
// as the anchors the fixture slices on. A renamed declaration or a union that
// moved to another file would not fail to compile — it would quietly yield an
// EMPTY set and make every assertion about a name pass by asserting nothing.
// This is the guard on the reader itself.
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
    // `cleanProps` iterates ALLOWED_PROPS, so a name in it that the union
    // never declared would filter events against a property nothing can set.
    for (const prop of ALLOWED_PROPS) {
      ok(PROPERTY_UNION.has(prop), `AnalyticsProperty is missing "${prop}"`);
    }
  });
});
