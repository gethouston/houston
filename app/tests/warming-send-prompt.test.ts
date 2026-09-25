import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  PendingWarmingSend,
  ProvisioningEntry,
} from "../src/lib/agent-provisioning/entry.ts";
import { parsePersistedProvisioning } from "../src/lib/agent-provisioning/persist.ts";
import {
  hasHiddenPrompt,
  missionPrompt,
  warmingPromptInputs,
} from "../src/lib/mission-prompt.ts";
import {
  chooseWarmingPrompt,
  undeliverableSend,
  type WarmingSendInput,
  warmingSendRecord,
} from "../src/lib/warming-send-prompt.ts";

/** What a setup chat's kickoff hands the queue: no text, all prompt. */
const KICKOFF =
  "<!-- houston:auto-continue -->You are Nova. Introduce yourself.";

/** Queue → localStorage mirror → relaunch, exactly the store's round trip:
 *  the entry is JSON in localStorage and every closure is gone. */
function afterReload(input: WarmingSendInput): PendingWarmingSend {
  const entry: ProvisioningEntry = {
    agentId: "a1",
    agentPath: "/w/a1",
    since: Date.now(),
    pendingSends: [warmingSendRecord(input)],
  };
  const [restored] = parsePersistedProvisioning(
    JSON.stringify([entry]),
    Date.now(),
  );
  const send = restored?.pendingSends?.[0];
  ok(send, "the mirror must survive the round trip");
  return send;
}

describe("the prompt a queued warming send delivers", () => {
  it("a setup kickoff survives a relaunch mid-warm-up", () => {
    const send = afterReload({
      sessionKey: "activity-m1",
      text: "",
      prompt: KICKOFF,
    });
    deepStrictEqual(chooseWarmingPrompt(send, undefined), {
      prompt: KICKOFF,
      source: "persisted",
    });
  });

  it("the live builder wins over the prompt stored at queue time", () => {
    const send = afterReload({
      sessionKey: "activity-m1",
      text: "",
      prompt: KICKOFF,
    });
    deepStrictEqual(chooseWarmingPrompt(send, "freshly built"), {
      prompt: "freshly built",
      source: "builder",
    });
  });

  it("an attachment send falls back to the user's words", () => {
    // Attachment prompts stay closures (they write through the warming pod),
    // so a relaunch leaves only the text — the pre-existing behavior.
    const send = afterReload({
      sessionKey: "activity-m2",
      text: "look at this",
    });
    deepStrictEqual(chooseWarmingPrompt(send, undefined), {
      prompt: "look at this",
      source: "text",
    });
  });

  it("refuses when there is nothing to put on the wire", () => {
    // Empty text AND no prompt: the runtime rejects an empty turn, so the
    // flush must report instead of sending.
    const send = afterReload({ sessionKey: "activity-m3", text: "" });
    strictEqual(chooseWarmingPrompt(send, undefined), null);
    // A builder that threw at flush leaves `built` undefined too.
    strictEqual(chooseWarmingPrompt({ text: "", prompt: "" }, ""), null);
  });

  it("a setup mission's kickoff reaches the wire across the relaunch", async () => {
    // End to end over the pure seam: what `createMissionWhileWarming` hands
    // the queue → the mirror → the flush's choice, with the closures gone.
    const opts = { kickoffPrompt: () => KICKOFF };
    const send = afterReload({
      sessionKey: "activity-m1",
      text: "",
      ...warmingPromptInputs(opts, "m1"),
    });
    strictEqual(chooseWarmingPrompt(send, undefined)?.prompt, KICKOFF);
  });

  it("an attachment builder is never resolved at queue time", () => {
    let ran = false;
    const opts = {
      buildPrompt: async (activityId: string) => {
        ran = true;
        return `saved under ${activityId}`;
      },
    };
    const inputs = warmingPromptInputs(opts, "m2");
    strictEqual(ran, false, "building writes through the warming pod");
    strictEqual(inputs.prompt, undefined);
    ok(inputs.buildPrompt, "it stays a closure for the flush");
  });

  it("either shape means the bubble shows the user's words", async () => {
    strictEqual(hasHiddenPrompt({ kickoffPrompt: () => KICKOFF }), true);
    strictEqual(hasHiddenPrompt({ buildPrompt: () => "x" }), true);
    strictEqual(hasHiddenPrompt({}), false);
    // The non-warming paths resolve the same two shapes, kickoff first.
    strictEqual(await missionPrompt({}, "m1", "typed"), "typed");
    strictEqual(
      await missionPrompt({ kickoffPrompt: () => KICKOFF }, "m1", "typed"),
      KICKOFF,
    );
    strictEqual(
      await missionPrompt({ buildPrompt: async () => "built" }, "m1", "typed"),
      "built",
    );
  });

  it("hands the mission of an undeliverable send back to the user", () => {
    // The row landed at the flush, so it exists with the default `running`
    // status and an empty chat — and no turn will ever settle it, because the
    // send that would have opened it has no prompt. `needs_you` is what turns
    // that permanent spinner into a card the user can act on.
    deepStrictEqual(undeliverableSend({ sessionKey: "activity-m3" }, "m3"), {
      reason: "queued send has no prompt to deliver (session activity-m3)",
      settleRow: { id: "m3", status: "needs_you" },
    });
  });

  it("settles nothing when the send created no row of its own", () => {
    // A parked follow-up, or a row create that failed: there is no card to
    // correct, only the report.
    strictEqual(
      undeliverableSend({ sessionKey: "activity-m4" }, null).settleRow,
      null,
    );
  });

  it("drops a mirrored prompt that is not a string", () => {
    const raw = JSON.stringify([
      {
        agentId: "a1",
        agentPath: "/w/a1",
        since: Date.now(),
        pendingSends: [
          { id: "s1", sessionKey: "activity-m1", text: "", prompt: 42 },
        ],
      },
    ]);
    const [restored] = parsePersistedProvisioning(raw, Date.now());
    deepStrictEqual(restored?.pendingSends, []);
  });
});
