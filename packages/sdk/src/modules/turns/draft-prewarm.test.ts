import type { ConversationPrewarmInput } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import {
  type ComposerDraft,
  DraftPrewarm,
  PREWARM_REFRESH_MS,
} from "./draft-prewarm";

const ON = { conversationPrewarm: true };

interface Request {
  conversationId: string;
  agentId: string;
  input: ConversationPrewarmInput;
  settle: (error?: Error) => void;
}

/** A policy over a manual clock and a prewarm that settles when told to.
 *  `autoSettle` answers every request at once. */
function harness(autoSettle = true) {
  let now = 1_000;
  let minted = 0;
  const requests: Request[] = [];
  const policy = new DraftPrewarm({
    prewarm: (conversationId, agentId, input) =>
      new Promise<unknown>((resolve, reject) => {
        const settle = (error?: Error) =>
          error ? reject(error) : resolve({ outcome: "launching" });
        requests.push({ conversationId, agentId, input, settle });
        if (autoSettle) settle();
      }),
    now: () => now,
    mintId: () => `id-${++minted}`,
  });
  const type = (draft: Partial<ComposerDraft> & { text: string }) =>
    policy.draftChanged(
      { agentId: "sales", draftKey: "activity-c1", ...draft },
      ON,
    );
  const advance = (ms: number) => {
    now += ms;
  };
  return { policy, requests, type, advance };
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

describe("rule 2: whitespace ends the typing session", () => {
  it("sends nothing for whitespace, and the next text is a first keystroke", async () => {
    const { requests, type } = harness();
    await type({ text: "h" });
    await type({ text: "  \n" });
    expect(requests).toHaveLength(1);
    await type({ text: "h" });
    expect(requests).toHaveLength(2);
  });
});

describe("rule 3: a routine's chat never prewarms", () => {
  it.each([
    "routine-r1",
    "routine-r1-run2",
    "ROUTINE-r1",
  ])("%s", async (conversationId) => {
    const { requests, type } = harness();
    await type({ conversationId, text: "hello" });
    expect(requests).toEqual([]);
  });
});

describe("rule 4: once at once, then at most every refresh interval", () => {
  it("sends on the first keystroke and refreshes only after the interval", async () => {
    const { requests, type, advance } = harness();
    await type({ conversationId: "activity-c1", text: "h" });
    expect(requests).toHaveLength(1);
    advance(PREWARM_REFRESH_MS - 1);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    advance(1);
    await type({ conversationId: "activity-c1", text: "hel" });
    expect(requests).toHaveLength(2);
    expect(PREWARM_REFRESH_MS).toBe(10_000);
  });

  it("never sends while the last request is still in flight", async () => {
    const { requests, type, advance } = harness(false);
    const first = type({ conversationId: "activity-c1", text: "h" });
    advance(PREWARM_REFRESH_MS * 3);
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
    let resolve: () => void = () => {};
    const calls: string[] = [];
    const policy = new DraftPrewarm({
      prewarm: (conversationId) => {
        calls.push(conversationId);
        return new Promise<void>((done) => {
          resolve = done;
        });
      },
      now: () => 0,
      mintId: () => "id-1",
    });
    const caps = { conversationPrewarm: true };
    const draft = { agentId: "a", draftKey: "k", conversationId: "activity-c" };
    const first = policy.draftChanged({ ...draft, text: "h" }, caps);
    await policy.draftChanged({ ...draft, text: "" }, caps);
    await policy.draftChanged({ ...draft, text: "hi" }, caps);
    expect(calls).toEqual(["activity-c"]);
    resolve();
    await first;
  });
});

describe("rule 5: a new slot, agent or chat is a new session", () => {
  it("sends at once on each change", async () => {
    const { requests, type } = harness();
    await type({ conversationId: "activity-c1", text: "h" });
    await type({ conversationId: "activity-c2", text: "h" });
    await type({ conversationId: "activity-c2", agentId: "ops", text: "h" });
    await type({
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

describe("rule 6: a new chat prewarms the id its first send claims", () => {
  it("mints one id per slot, keeps it across sessions, and the claim returns it once", async () => {
    const { policy, requests, type, advance } = harness();
    await type({ draftKey: "new:board", text: "h" });
    await type({ draftKey: "new:board", text: " " });
    advance(PREWARM_REFRESH_MS);
    await type({ draftKey: "new:board", text: "h" });
    await type({ draftKey: "new:other", text: "h" });
    expect(ids(requests)).toEqual([
      "activity-id-1",
      "activity-id-1",
      "activity-id-2",
    ]);
    expect(policy.claimNewConversationId("new:board")).toBe("id-1");
    // Claimed means forgotten: the next new chat in the slot is its own.
    expect(policy.claimNewConversationId("new:board")).toBe("id-3");
    await type({ draftKey: "new:board", text: "next" });
    expect(requests.at(-1)?.conversationId).toBe("activity-id-4");
    expect(policy.claimNewConversationId("new:board")).toBe("id-4");
  });

  it("an open chat mints nothing", async () => {
    const { policy, type } = harness();
    await type({
      draftKey: "activity-c1",
      conversationId: "activity-c1",
      text: "h",
    });
    expect(policy.claimNewConversationId("activity-c1")).toBe("id-1");
  });
});

describe("rule 7: the caller hears the request's outcome, and nothing retries", () => {
  it("rejects with the request's error and waits out the interval before asking again", async () => {
    const { requests, type, advance } = harness(false);
    const failed = type({ conversationId: "activity-c1", text: "h" });
    const boom = new Error("gateway said no");
    requests[0].settle(boom);
    await expect(failed).rejects.toBe(boom);
    await type({ conversationId: "activity-c1", text: "he" });
    expect(requests).toHaveLength(1);
    advance(PREWARM_REFRESH_MS);
    const again = type({ conversationId: "activity-c1", text: "hel" });
    requests[1].settle();
    await expect(again).resolves.toBeUndefined();
    expect(requests).toHaveLength(2);
  });
});

describe("the prewarm carries the composer's pin", () => {
  it("forwards a set provider and model and drops empty ones", async () => {
    const { requests, type } = harness();
    await type({
      conversationId: "activity-c1",
      text: "h",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    await type({
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

describe("state belongs to one policy", () => {
  it("two policies share no sessions and no pending ids", async () => {
    const one = harness();
    const two = harness();
    await one.type({ draftKey: "new", text: "h" });
    await two.type({ draftKey: "new", text: "h" });
    expect(one.requests).toHaveLength(1);
    expect(two.requests).toHaveLength(1);
    expect(two.policy.claimNewConversationId("new")).toBe("id-1");
    expect(one.policy.claimNewConversationId("new")).toBe("id-1");
  });
});
