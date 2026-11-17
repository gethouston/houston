import type { ConversationPrewarmInput } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import {
  type ComposerDraft,
  DraftPrewarm,
  PREWARM_REFRESH_MS,
} from "./draft-prewarm";
import { PREWARM_TYPING_GAP_MS, PREWARM_TYPING_MS } from "./draft-typing";

const ON = { conversationPrewarm: true };
const HOLD_MS = 20_000;
/** Keystrokes this far apart are typing on. */
const KEY_MS = 250;

interface Request {
  conversationId: string;
  agentId: string;
  input: ConversationPrewarmInput;
  settle: (error?: Error) => void;
}

/** A policy over a manual clock and a prewarm that settles when told to.
 *  `autoSettle` answers every request at once, holding for `holdMs`. */
function harness(autoSettle = true, holdMs = HOLD_MS) {
  let now = 1_000;
  let minted = 0;
  const requests: Request[] = [];
  const policy = new DraftPrewarm({
    prewarm: (conversationId, agentId, input) =>
      new Promise<unknown>((resolve, reject) => {
        const settle = (error?: Error) =>
          error ? reject(error) : resolve({ outcome: "launching", holdMs });
        requests.push({ conversationId, agentId, input, settle });
        if (autoSettle) settle();
      }),
    now: () => now,
    mintId: () => `id-${++minted}`,
  });
  type Draft = Partial<ComposerDraft> & { text: string };
  const type = (draft: Draft) =>
    policy.draftChanged(
      { agentId: "sales", draftKey: "activity-c1", ...draft },
      ON,
    );
  const advance = (ms: number) => {
    now += ms;
  };
  /** Types on for just under the threshold: the next keystroke is the one
   *  that reaches it. */
  const typeUpTo = async (draft: Draft) => {
    for (let t = 0; t < PREWARM_TYPING_MS; t += KEY_MS) {
      await type(draft);
      advance(KEY_MS);
    }
  };
  /** Types on until the threshold, its last keystroke included. */
  const typeOn = async (draft: Draft) => {
    await typeUpTo(draft);
    await type(draft);
  };
  return { policy, requests, type, typeUpTo, typeOn, advance };
}

const ids = (requests: Request[]) => requests.map((r) => r.conversationId);

describe("rule 1: only a deployment that serves prewarm is asked", () => {
  it.each([
    ["not loaded", undefined],
    ["null", null],
    ["absent", {}],
    ["false", { conversationPrewarm: false }],
  ])("%s capability makes no request", async (_, capabilities) => {
    const { policy, requests } = harness();
    await expect(
      policy.draftChanged(
        { agentId: "sales", draftKey: "new", text: "hello" },
        capabilities,
      ),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([]);
    // Nothing was minted either: the claim is a fresh id.
    expect(policy.claimNewConversationId("new")).toBe("id-1");
  });
});

describe("rule 2: only typing on starts a prewarm", () => {
  it("a stray keystroke readies nothing", async () => {
    const { requests, type, advance } = harness();
    await type({ text: "h" });
    advance(PREWARM_TYPING_MS * 4);
    expect(requests).toEqual([]);
    expect(PREWARM_TYPING_MS).toBe(1_500);
  });

  it("typing that stops short of the threshold readies nothing", async () => {
    const { requests, type, typeUpTo, advance } = harness();
    await typeUpTo({ text: "he" });
    // A pause past the gap: the next keystroke starts the count over.
    advance(PREWARM_TYPING_GAP_MS + 1);
    await type({ text: "hel" });
    expect(requests).toEqual([]);
    await typeUpTo({ text: "hell" });
    expect(requests).toEqual([]);
    await type({ text: "hello" });
    expect(requests).toHaveLength(1);
  });

  it("a pause within the gap is still typing on", async () => {
    const { requests, type, advance } = harness();
    await type({ text: "h" });
    advance(PREWARM_TYPING_GAP_MS);
    await type({ text: "he" });
    advance(PREWARM_TYPING_MS - PREWARM_TYPING_GAP_MS);
    await type({ text: "hel" });
    expect(requests).toHaveLength(1);
  });
});

describe("rule 3: whitespace ends the typing session", () => {
  it("sends nothing for whitespace, and the next text starts over", async () => {
    const { requests, type, typeOn } = harness();
    await typeOn({ text: "h" });
    await type({ text: "  \n" });
    expect(requests).toHaveLength(1);
    await type({ text: "h" });
    expect(requests).toHaveLength(1);
    await typeOn({ text: "h" });
    expect(requests).toHaveLength(2);
  });
});

describe("rule 4: a routine's chat never prewarms", () => {
  it.each(["routine-r1", "routine-r1-run2", "ROUTINE-r1"])(
    "%s",
    async (conversationId) => {
      const { requests, typeOn } = harness();
      await typeOn({ conversationId, text: "hello" });
      expect(requests).toEqual([]);
    },
  );
});

describe("rule 5: a held prewarm refreshes at most every interval, while it holds", () => {
  it("any keystroke past the interval refreshes a running hold", async () => {
    const { requests, type, typeOn, advance } = harness();
    await typeOn({ conversationId: "activity-c1", text: "h" });
    expect(requests).toHaveLength(1);
    advance(PREWARM_REFRESH_MS - 1);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    // A pause past the gap, but the hold still runs: one keystroke refreshes.
    advance(1);
    await type({ conversationId: "activity-c1", text: "hel" });
    expect(requests).toHaveLength(2);
    expect(PREWARM_REFRESH_MS).toBe(10_000);
  });

  it("once the hold ended, the next prewarm waits for typing on", async () => {
    const { requests, type, typeOn, advance } = harness();
    await typeOn({ conversationId: "activity-c1", text: "h" });
    advance(HOLD_MS);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    await typeOn({ conversationId: "activity-c1", text: "hel" });
    expect(requests).toHaveLength(2);
  });

  it("a skip holds nothing: the next ask waits the interval and for typing on", async () => {
    const { requests, type, typeOn, advance } = harness(true, 0);
    await typeOn({ conversationId: "activity-c1", text: "h" });
    advance(PREWARM_REFRESH_MS);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    await typeOn({ conversationId: "activity-c1", text: "hel" });
    expect(requests).toHaveLength(2);
  });

  it("never sends while the last request is still in flight", async () => {
    const { requests, type, typeUpTo, advance } = harness(false);
    await typeUpTo({ conversationId: "activity-c1", text: "h" });
    const first = type({ conversationId: "activity-c1", text: "h" });
    // Past the interval, inside the hold: only the request in flight stops it.
    advance(PREWARM_REFRESH_MS);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    requests[0].settle();
    await first;
    const next = type({ conversationId: "activity-c1", text: "hel" });
    expect(requests).toHaveLength(2);
    requests[1].settle();
    await next;
  });
});

describe("an emptied composer does not reopen the in-flight guard", () => {
  it("clearing and retyping while a prewarm is out sends no second one", async () => {
    const { requests, type, typeUpTo, typeOn } = harness(false);
    await typeUpTo({ conversationId: "activity-c", text: "h" });
    const first = type({ conversationId: "activity-c", text: "h" });
    await type({ conversationId: "activity-c", text: "" });
    await typeOn({ conversationId: "activity-c", text: "hi" });
    expect(ids(requests)).toEqual(["activity-c"]);
    requests[0].settle();
    await first;
  });
});

describe("rule 6: a new slot, agent or chat is a new session", () => {
  it("each change starts over and asks once it is typed on", async () => {
    const { requests, typeOn } = harness();
    await typeOn({ conversationId: "activity-c1", text: "h" });
    await typeOn({ conversationId: "activity-c2", text: "h" });
    await typeOn({ conversationId: "activity-c2", agentId: "ops", text: "h" });
    await typeOn({
      conversationId: "activity-c2",
      agentId: "ops",
      draftKey: "activity-c2",
      text: "h",
    });
    expect(requests.map((r) => [r.agentId, r.conversationId])).toEqual([
      ["sales", "activity-c1"],
      ["sales", "activity-c2"],
      ["ops", "activity-c2"],
      ["ops", "activity-c2"],
    ]);
  });
});

describe("rule 7: a new chat prewarms the id its first send claims", () => {
  it("mints one id per slot, keeps it across sessions, and the claim returns it once", async () => {
    const { policy, requests, type, typeOn, advance } = harness();
    await typeOn({ draftKey: "new:board", text: "h" });
    await type({ draftKey: "new:board", text: " " });
    advance(HOLD_MS);
    await typeOn({ draftKey: "new:board", text: "h" });
    await typeOn({ draftKey: "new:other", text: "h" });
    expect(ids(requests)).toEqual([
      "activity-id-1",
      "activity-id-1",
      "activity-id-2",
    ]);
    expect(policy.claimNewConversationId("new:board")).toBe("id-1");
    // Claimed means forgotten: the next new chat in the slot is its own.
    expect(policy.claimNewConversationId("new:board")).toBe("id-3");
    await typeOn({ draftKey: "new:board", text: "next" });
    expect(requests.at(-1)?.conversationId).toBe("activity-id-4");
    expect(policy.claimNewConversationId("new:board")).toBe("id-4");
  });

  it("an open chat mints nothing", async () => {
    const { policy, typeOn } = harness();
    await typeOn({
      draftKey: "activity-c1",
      conversationId: "activity-c1",
      text: "h",
    });
    expect(policy.claimNewConversationId("activity-c1")).toBe("id-1");
  });
});

describe("rule 8: the caller hears the request's outcome, and nothing retries", () => {
  it("rejects with the request's error and waits out the interval before asking again", async () => {
    const { requests, type, typeUpTo, advance } = harness(false);
    await typeUpTo({ conversationId: "activity-c1", text: "h" });
    const failed = type({ conversationId: "activity-c1", text: "h" });
    const boom = new Error("gateway said no");
    requests[0].settle(boom);
    await expect(failed).rejects.toBe(boom);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    advance(PREWARM_REFRESH_MS);
    await typeUpTo({ conversationId: "activity-c1", text: "hel" });
    const again = type({ conversationId: "activity-c1", text: "hell" });
    requests[1].settle();
    await expect(again).resolves.toBeUndefined();
    expect(requests).toHaveLength(2);
  });
});

describe("the prewarm carries the composer's pin", () => {
  it("forwards a set provider and model and drops empty ones", async () => {
    const { requests, typeOn } = harness();
    await typeOn({
      conversationId: "activity-c1",
      text: "h",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    await typeOn({
      conversationId: "activity-c2",
      text: "h",
      provider: "",
      model: "",
    });
    expect(requests.map((r) => r.input)).toEqual([
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      {},
    ]);
  });
});

describe("a clock that goes back restarts the run", () => {
  it("typing before the rollback never counts toward the threshold", async () => {
    const { requests, type, advance } = harness();
    await type({ text: "h" });
    advance(PREWARM_TYPING_GAP_MS);
    await type({ text: "he" });
    // The clock is corrected back; the next keystrokes are a second apart.
    advance(-500);
    await type({ text: "hel" });
    advance(PREWARM_TYPING_GAP_MS);
    await type({ text: "hell" });
    expect(requests).toEqual([]);
  });
});

describe("state belongs to one policy", () => {
  it("two policies share no sessions and no pending ids", async () => {
    const one = harness();
    const two = harness();
    await one.typeOn({ draftKey: "new", text: "h" });
    await two.typeOn({ draftKey: "new", text: "h" });
    expect(one.requests).toHaveLength(1);
    expect(two.requests).toHaveLength(1);
    expect(two.policy.claimNewConversationId("new")).toBe("id-1");
    expect(one.policy.claimNewConversationId("new")).toBe("id-1");
  });

  it("a refresh in flight when the SDK is replaced settles the hold the replacement reads", async () => {
    const one = harness(false);
    await one.typeUpTo({ conversationId: "activity-c1", text: "h" });
    const first = one.type({ conversationId: "activity-c1", text: "h" });
    one.requests[0].settle();
    await first;
    one.advance(PREWARM_REFRESH_MS);
    const refresh = one.type({ conversationId: "activity-c1", text: "he" });
    expect(one.requests).toHaveLength(2);
    const two = harness();
    two.advance(PREWARM_TYPING_MS + PREWARM_REFRESH_MS + 250);
    two.policy.adopt(one.policy.state());
    one.requests[1].settle();
    await refresh;
    // Inside the refreshed hold, past the interval: one keystroke refreshes.
    two.advance(PREWARM_REFRESH_MS);
    await two.type({ conversationId: "activity-c1", text: "hel" });
    expect(two.requests).toHaveLength(1);
  });

  it("a replacement policy adopts the typing run and the hold", async () => {
    const one = harness();
    await one.typeUpTo({ draftKey: "new", text: "h" });
    const two = harness();
    two.advance(PREWARM_TYPING_MS);
    two.policy.adopt(one.policy.state());
    // The run carried over: the next keystroke reaches the threshold.
    await two.type({ draftKey: "new", text: "he" });
    expect(two.requests).toHaveLength(1);
    expect(two.policy.claimNewConversationId("new")).toBe("id-1");
  });
});
