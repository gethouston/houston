import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import type { SessionStatusValue } from "@houston/sdk";
import { createInteractionOutcomes } from "../src/components/chat-interaction-reply.ts";
import {
  retireParkedInteractionOnFeedItem,
  retireParkedInteractionOnSessionStatus,
  TURN_EVIDENCE_FEED_TYPES,
} from "../src/lib/interaction-draft-retire.ts";
import {
  interactionDraftKey,
  useInteractionDraftStore,
} from "../src/stores/interaction-drafts.ts";

const SESSION = "activity-A";
const OTHER_SESSION = "activity-B";

const STEPS: InteractionStep[] = [
  { kind: "question", id: "q1", question: "Which folder?" },
];

function park(sessionKey: string) {
  useInteractionDraftStore.getState().park(sessionKey, {
    key: interactionDraftKey(STEPS),
    state: { current: 0, reached: 0, answers: {}, drafts: { q1: "hola" } },
    outcomes: createInteractionOutcomes(),
  });
}

const isParked = (sessionKey: string) =>
  useInteractionDraftStore.getState().parked[sessionKey] !== undefined;

const OPTIMISTIC_BUBBLE = {
  feed_type: "user_message",
  data: "run it",
  pending: true,
};
const SEND_REJECTED = {
  feed_type: "system_message",
  data: "Couldn't send that.",
  fails_pending: true,
};
const PROVIDER_REFUSAL_CARD = {
  feed_type: "provider_error",
  data: { kind: "unauthenticated", provider: "anthropic" },
  fails_pending: true,
};
const INVISIBLE_FINAL = {
  feed_type: "final_result",
  data: { result: "", cost_usd: null, duration_ms: null, usage: null },
};

describe("retiring a parked card once a turn takes its conversation", () => {
  beforeEach(() => {
    useInteractionDraftStore.getState().reset();
  });

  it("keeps the card through a send the server rejected", () => {
    park(SESSION);

    retireParkedInteractionOnSessionStatus("running", SESSION);
    retireParkedInteractionOnFeedItem(SESSION, OPTIMISTIC_BUBBLE);
    retireParkedInteractionOnFeedItem(SESSION, SEND_REJECTED);
    retireParkedInteractionOnSessionStatus("error", SESSION);

    ok(isParked(SESSION), "a refused send threw the answers away");
  });

  it("keeps the card through a provider-auth refusal", () => {
    park(SESSION);

    retireParkedInteractionOnSessionStatus("running", SESSION);
    retireParkedInteractionOnFeedItem(SESSION, OPTIMISTIC_BUBBLE);
    retireParkedInteractionOnFeedItem(SESSION, PROVIDER_REFUSAL_CARD);
    retireParkedInteractionOnFeedItem(SESSION, INVISIBLE_FINAL);
    retireParkedInteractionOnSessionStatus("error", SESSION);

    ok(isParked(SESSION), "a provider refusal threw the answers away");
  });

  it("counts every frame a LIVE TURN produces as evidence", () => {
    deepStrictEqual([...TURN_EVIDENCE_FEED_TYPES].sort(), [
      "assistant_text",
      "assistant_text_streaming",
      "context_cleared",
      "context_compacted",
      "file_changes",
      "provider_error",
      "provider_switched",
      "thinking",
      "thinking_streaming",
      "tool_call",
      "tool_result",
    ]);
  });

  for (const feed_type of TURN_EVIDENCE_FEED_TYPES) {
    it(`forgets the card on a server ${feed_type} frame`, () => {
      park(SESSION);

      retireParkedInteractionOnFeedItem(SESSION, { feed_type });

      ok(!isParked(SESSION));
    });
  }

  for (const item of [
    INVISIBLE_FINAL,
    { feed_type: "system_message", data: "Couldn't reload the conversation." },
  ]) {
    it(`keeps the card on a bare ${item.feed_type} — each has a synthetic, no-turn producer`, () => {
      park(SESSION);

      retireParkedInteractionOnFeedItem(SESSION, item);

      ok(isParked(SESSION));
    });
  }

  it("forgets the card on a turn whose only frame was a boundary", () => {
    park(SESSION);

    retireParkedInteractionOnSessionStatus("running", SESSION);
    retireParkedInteractionOnFeedItem(SESSION, OPTIMISTIC_BUBBLE);
    retireParkedInteractionOnFeedItem(SESSION, {
      feed_type: "provider_switched",
      data: { provider: "openai-codex", summarized: false, pre_tokens: 12 },
    });
    retireParkedInteractionOnFeedItem(SESSION, {
      feed_type: "provider_error",
      data: { kind: "rate_limited" },
    });
    retireParkedInteractionOnFeedItem(SESSION, INVISIBLE_FINAL);
    retireParkedInteractionOnSessionStatus("error", SESSION);

    ok(!isParked(SESSION), "a turn that ran left the answers parked");
  });

  it("forgets the card on a provider error that interrupted a live turn", () => {
    park(SESSION);

    retireParkedInteractionOnFeedItem(SESSION, {
      feed_type: "assistant_text_streaming",
      data: "Looking",
    });
    retireParkedInteractionOnFeedItem(SESSION, {
      feed_type: "provider_error",
      data: { kind: "rate_limited" },
    });

    ok(!isParked(SESSION));
  });

  it("forgets the card when a turn settles on that conversation", () => {
    park(SESSION);

    retireParkedInteractionOnSessionStatus("completed", SESSION);

    ok(!isParked(SESSION));
  });

  for (const status of [
    "starting",
    "running",
    "error",
  ] satisfies SessionStatusValue[]) {
    it(`keeps the card on ${status} alone — no turn is proven yet`, () => {
      park(SESSION);

      retireParkedInteractionOnSessionStatus(status, SESSION);

      ok(isParked(SESSION));
    });
  }

  it("retires the conversation the frame belongs to, not the one on screen", () => {
    park(SESSION);
    park(OTHER_SESSION);

    retireParkedInteractionOnFeedItem(OTHER_SESSION, {
      feed_type: "assistant_text",
      data: "done",
    });

    ok(isParked(SESSION));
    ok(!isParked(OTHER_SESSION));
  });

  it("a turn on a conversation that parked nothing changes nothing", () => {
    park(SESSION);
    const before = useInteractionDraftStore.getState().parked;

    retireParkedInteractionOnSessionStatus("completed", OTHER_SESSION);
    retireParkedInteractionOnFeedItem(OTHER_SESSION, {
      feed_type: "assistant_text",
      data: "done",
    });

    strictEqual(useInteractionDraftStore.getState().parked, before);
  });
});
