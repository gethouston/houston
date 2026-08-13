import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  notifyAnalytics,
  subscribeAnalytics,
} from "../src/lib/analytics-bus.ts";

// The bus contains the errors it reports.
console.error = () => {};

describe("the analytics bus", () => {
  it("hands every listener the event and its props", () => {
    const seen: string[] = [];
    const off = subscribeAnalytics((name) => seen.push(name));
    const props: Record<string, unknown>[] = [];
    const offProps = subscribeAnalytics((_, p) => {
      if (p) props.push(p);
    });

    notifyAnalytics("chat_message_sent", { agent_id: "a1" });
    off();
    offProps();

    deepStrictEqual(seen, ["chat_message_sent"]);
    deepStrictEqual(props, [{ agent_id: "a1" }]);
  });

  it("stops delivering once a listener unsubscribes", () => {
    let count = 0;
    const off = subscribeAnalytics(() => {
      count += 1;
    });
    notifyAnalytics("mission_created");
    off();
    notifyAnalytics("mission_created");
    strictEqual(count, 1);
  });

  it("survives a listener that throws, and still reaches the next one", () => {
    // Analytics is a side channel: a broken listener must never take down the
    // user action that emitted the event, nor the listeners behind it.
    const reached: string[] = [];
    const offBroken = subscribeAnalytics(() => {
      throw new Error("listener exploded");
    });
    const offGood = subscribeAnalytics((name) => reached.push(name));

    notifyAnalytics("skill_used");
    offBroken();
    offGood();
    deepStrictEqual(reached, ["skill_used"]);
  });

  it("lets a listener unsubscribe from inside the fan-out", () => {
    let count = 0;
    const off = subscribeAnalytics(() => {
      count += 1;
      off();
    });
    notifyAnalytics("agent_created");
    notifyAnalytics("agent_created");
    strictEqual(count, 1);
  });
});

// `analytics.ts` can't be imported here (posthog-js + the engine client come
// with it), so its half of the seam is asserted against the source.
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

describe("analytics.track's seam with the app", () => {
  it("notifies the app BEFORE the PostHog no-op path", () => {
    // A build with no POSTHOG_KEY returns early — if the notify sat after that
    // return, nobody would earn a usage point in local development.
    const track = block(
      "track: (event: AnalyticsEventName",
      "trackAiGeneration",
    );
    const notify = track.indexOf("notifyAnalytics(event, props)");
    const bail = track.indexOf("if (!KEY) return;");
    ok(notify >= 0, "track no longer notifies the analytics bus");
    ok(bail > notify, "track bails out on a missing key before notifying");
  });

  it("re-exports the subscription as part of the analytics API", () => {
    ok(SOURCE.includes('export { subscribeAnalytics } from "./analytics-bus"'));
  });

  it("declares the Academy lesson events and their property", () => {
    const events = quoted(block("export type AnalyticsEventName =", ";\n"));
    for (const event of [
      "academy_lesson_started",
      "academy_lesson_completed",
    ]) {
      ok(events.has(event), `AnalyticsEventName is missing "${event}"`);
    }
    const props = quoted(block("type AnalyticsProperty =", ";\n"));
    const allowed = quoted(
      block("const ALLOWED_PROPS = new Set<AnalyticsProperty>([", "]);"),
    );
    // `cleanProps` drops anything missing from the Set, silently.
    ok(props.has("lesson"), 'AnalyticsProperty is missing "lesson"');
    ok(allowed.has("lesson"), 'ALLOWED_PROPS is missing "lesson"');
  });
});
