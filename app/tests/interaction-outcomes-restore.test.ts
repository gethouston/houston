import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createInteractionOutcomes } from "../src/components/chat-interaction-reply.ts";
import { restoreInteractionOutcomes } from "../src/lib/interaction-outcomes-restore.ts";

function walkedOutcomes() {
  const outcomes = createInteractionOutcomes();
  outcomes.connects.set("c1", { name: "Gmail", connected: false });
  outcomes.credentials.set("k1", {
    name: "Acme",
    saved: false,
    message: "use the other key",
  });
  outcomes.handsOn.set("h1", { name: "Billing", finished: true });
  outcomes.credentialModes.set("Acme", "oauth");
  outcomes.signin = "skipped";
  outcomes.signinDeclineText = "I will do it later";
  return outcomes;
}

describe("restoring an interaction outcome log (PRODUCT-1902)", () => {
  it("carries every recorded outcome across a remount", () => {
    const walked = walkedOutcomes();
    const restored = createInteractionOutcomes();

    restoreInteractionOutcomes(restored, walked);

    deepStrictEqual(restored, walked);
  });

  it("restores into the very log the step cards already close over", () => {
    const target = createInteractionOutcomes();
    const { connects } = target;

    restoreInteractionOutcomes(target, walkedOutcomes());

    strictEqual(target.connects, connects);
    deepStrictEqual(connects.get("c1"), { name: "Gmail", connected: false });
  });

  it("leaves the parked log untouched, so it can be restored again", () => {
    const parked = walkedOutcomes();

    restoreInteractionOutcomes(createInteractionOutcomes(), parked);

    deepStrictEqual(parked, walkedOutcomes());
  });

  it("replaces what the log held instead of merging into it", () => {
    const target = walkedOutcomes();
    target.connects.set("c9", { name: "Slack", connected: true });

    restoreInteractionOutcomes(target, createInteractionOutcomes());

    deepStrictEqual(target, createInteractionOutcomes());
  });

  it("restoring an untouched log is exactly a fresh log", () => {
    const target = walkedOutcomes();

    restoreInteractionOutcomes(target, createInteractionOutcomes());

    deepStrictEqual(target, {
      connects: new Map(),
      credentials: new Map(),
      handsOn: new Map(),
      credentialModes: new Map(),
      signin: "pending",
      signinDeclineText: undefined,
    });
  });
});
