import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { OrgsList } from "@houston/engine-adapter";

// The tracker's clock is the browser window's; node's globals stand in.
Object.assign(globalThis, { window: globalThis });

const {
  planPresenceDue,
  markPlanPresence,
  billingCheckout,
  resetPlanSessionForIdentityChange,
} = await import("../src/lib/plan-session");

const ORG = "00000000000000aa";
const paidUp = {
  orgs: [
    {
      slug: ORG,
      billing: { tier: "paid", status: "active", lockAt: null },
    },
  ],
} as unknown as OrgsList;

const ports = {
  create: async () => ({ url: "https://checkout.stripe.test/s" }),
  open: async () => true,
};

test("an identity change drops the outgoing account's open checkout", async () => {
  assert.equal(await billingCheckout.start(ORG, ports), true);
  assert.equal(billingCheckout.getSnapshot().phase, "open");
  resetPlanSessionForIdentityChange();
  assert.equal(billingCheckout.getSnapshot().phase, "idle");
});

test("an identity change drops the outgoing account's success", async () => {
  await billingCheckout.start(ORG, ports);
  billingCheckout.observe(paidUp);
  assert.equal(billingCheckout.getSnapshot().phase, "succeeded");
  resetPlanSessionForIdentityChange();
  assert.equal(billingCheckout.getSnapshot().phase, "idle");
});

test("the next account reports presence immediately", () => {
  const now = Date.now();
  markPlanPresence(ORG, now);
  assert.equal(planPresenceDue(ORG, now), false);
  resetPlanSessionForIdentityChange();
  assert.equal(planPresenceDue(ORG, now), true);
});

test("presence in one org does not stand for another", () => {
  const now = Date.now();
  markPlanPresence(ORG, now);
  assert.equal(planPresenceDue("00000000000000bb", now), true);
});

test("resetForIdentityChange resets the plan session with its peers", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/identity-reset.ts"),
    "utf8",
  );
  assert.match(source, /\n {2}resetPlanSessionForIdentityChange\(\);\n/);
});
