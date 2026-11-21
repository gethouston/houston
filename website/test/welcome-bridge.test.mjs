import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  join(here, "..", "src", "welcome", "index.html"),
  "utf8",
);
const inline = page.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline, "welcome/index.html no longer carries an inline script");
const source = inline[1];

const INSTALL_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function visit({ installId = INSTALL_ID, analytics, posthog } = {}) {
  const handlers = [];
  const window = {
    addEventListener: (name, handler) => {
      if (name === "DOMContentLoaded") handlers.push(handler);
    },
    location: {
      search: installId === null ? "" : `?install_id=${installId}`,
    },
    HoustonAnalytics: analytics,
    posthog,
  };
  new Function("window", source)(window);
  assert.equal(handlers.length, 1, "the bridge must wait for DOMContentLoaded");
  for (const handler of handlers) handler();
}

function fakeAnalytics({ valid = true } = {}) {
  const tracked = [];
  return {
    tracked,
    isInstallId: () => valid,
    track: (name, fields) => tracked.push({ name, fields }),
  };
}

function fakePosthog({ throws = false } = {}) {
  const calls = [];
  const record =
    (name) =>
    (...args) => {
      calls.push({ name, args });
      if (throws) throw new Error("blocked");
    };
  return {
    calls,
    alias: record("alias"),
    identify: record("identify"),
    capture: record("capture"),
  };
}

test("bridges PostHog even when the first-party sink never loaded", () => {
  const posthog = fakePosthog();
  visit({ posthog });
  assert.deepEqual(
    posthog.calls.map((call) => call.name),
    ["alias", "identify", "capture"],
  );
  assert.deepEqual(posthog.calls[0].args, [INSTALL_ID]);
  assert.equal(posthog.calls[1].args[0], INSTALL_ID);
  assert.ok(posthog.calls[1].args[1].attribution_bridged_at);
  assert.deepEqual(posthog.calls[2].args, [
    "install_bridged",
    { source: "website" },
  ]);
});

test("fires the first-party event even when PostHog is blocked", () => {
  const analytics = fakeAnalytics();
  visit({ analytics });
  assert.deepEqual(analytics.tracked, [
    { name: "welcome_bridged", fields: { install_id: INSTALL_ID } },
  ]);
});

test("fires both when both assets loaded", () => {
  const analytics = fakeAnalytics();
  const posthog = fakePosthog();
  visit({ analytics, posthog });
  assert.equal(analytics.tracked.length, 1);
  assert.equal(posthog.calls.length, 3);
});

test("a PostHog that throws never costs the first-party event", () => {
  const analytics = fakeAnalytics();
  visit({ analytics, posthog: fakePosthog({ throws: true }) });
  assert.equal(analytics.tracked.length, 1);
});

test("an id the gateway would refuse bridges neither sink", () => {
  const analytics = fakeAnalytics({ valid: false });
  const posthog = fakePosthog();
  visit({ analytics, posthog, installId: "not-a-uuid" });
  assert.deepEqual(analytics.tracked, []);
  assert.equal(posthog.calls.length, 0);
});

test("without the first-party asset the page still refuses a non-canonical id", () => {
  const posthog = fakePosthog();
  visit({
    analytics: undefined,
    posthog,
    installId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  });
  assert.equal(posthog.calls.length, 0);
});

test("does nothing at all without an install id", () => {
  const analytics = fakeAnalytics();
  const posthog = fakePosthog();
  visit({ analytics, posthog, installId: null });
  assert.deepEqual(analytics.tracked, []);
  assert.deepEqual(posthog.calls, []);
});
