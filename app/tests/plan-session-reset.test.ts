import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { PlanSummary } from "@houston/engine-adapter";

// The tracker's clock is the browser window's; node's globals stand in.
Object.assign(globalThis, { window: globalThis });

const {
  planPresenceDue,
  markPlanPresence,
  plusCheckout,
  resetPlanSessionForIdentityChange,
} = await import("../src/lib/plan-session");

const ports = {
  create: async () => ({ url: "https://checkout.stripe.test/s" }),
  open: async () => true,
};

test("an identity change drops the outgoing account's open checkout", async () => {
  assert.equal(await plusCheckout.start(ports), true);
  assert.equal(plusCheckout.getSnapshot().phase, "open");
  resetPlanSessionForIdentityChange();
  assert.equal(plusCheckout.getSnapshot().phase, "idle");
});

test("an identity change drops the outgoing account's success", async () => {
  await plusCheckout.start(ports);
  plusCheckout.observe({ plan: "plus" } as PlanSummary);
  assert.equal(plusCheckout.getSnapshot().phase, "succeeded");
  resetPlanSessionForIdentityChange();
  assert.equal(plusCheckout.getSnapshot().phase, "idle");
});

test("the next account reports presence immediately", () => {
  const now = Date.now();
  markPlanPresence(now);
  assert.equal(planPresenceDue(now), false);
  resetPlanSessionForIdentityChange();
  assert.equal(planPresenceDue(now), true);
});

test("resetForIdentityChange resets the plan session with its peers", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/identity-reset.ts"),
    "utf8",
  );
  assert.match(source, /\n {2}resetPlanSessionForIdentityChange\(\);\n/);
});
