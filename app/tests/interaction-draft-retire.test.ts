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

/** The optimistic user bubble `streamTurn` pushes before it even calls the
 *  engine — the client's own echo, not evidence of anything. */
const OPTIMISTIC_BUBBLE = {
  feed_type: "user_message",
  data: "run it",
  pending: true,
};
/** The marker a send REJECTED before it reached the engine carries (403,
 *  offline, engine refusing): it fails the bubble it follows. */
const SEND_REJECTED = {
  feed_type: "system_message",
  data: "Couldn't send that.",
  fails_pending: true,
};
/** The typed card a provider-auth refusal settles on: the prompt never left,
 *  so it fails the bubble it follows (`settleProviderErrorCard`). */
const PROVIDER_REFUSAL_CARD = {
  feed_type: "provider_error",
  data: { kind: "unauthenticated", provider: "anthropic" },
  fails_pending: true,
};
/** The invisible final_result every handled settle pushes to stop the progress
 *  line — UNFLAGGED, and produced with no turn behind it. */
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

    // Exactly what a rejected send emits, in order: the optimistic status, the
    // optimistic bubble, the rejection marker, the settle.
    retireParkedInteractionOnSessionStatus("running", SESSION);
    retireParkedInteractionOnFeedItem(SESSION, OPTIMISTIC_BUBBLE);
    retireParkedInteractionOnFeedItem(SESSION, SEND_REJECTED);
    retireParkedInteractionOnSessionStatus("error", SESSION);

    ok(isParked(SESSION), "a refused send threw the answers away");
  });

  it("keeps the card through a provider-auth refusal", () => {
    park(SESSION);

    // Exactly what a refused provider emits, in order: the optimistic status,
    // the optimistic bubble, the typed card (the prompt never left), the
    // invisible final_result that stops the progress line, the settle.
    retireParkedInteractionOnSessionStatus("running", SESSION);
    retireParkedInteractionOnFeedItem(SESSION, OPTIMISTIC_BUBBLE);
    retireParkedInteractionOnFeedItem(SESSION, PROVIDER_REFUSAL_CARD);
    retireParkedInteractionOnFeedItem(SESSION, INVISIBLE_FINAL);
    retireParkedInteractionOnSessionStatus("error", SESSION);

    ok(isParked(SESSION), "a provider refusal threw the answers away");
  });

  it("counts every frame a LIVE TURN produces as evidence", () => {
    // The audit of every `pushFeedItem` producer in the SDK turn machinery
    // (`turn-frames.ts`, `turn-sink.ts`, `turn-settle.ts`), minus the three
    // types that also have a no-turn producer: `final_result` (the invisible
    // settle), `system_message` (send-rejected, reload-failed,
    // board-persist-failed) and `user_message` (the client's own echo, pushed
    // unflagged for a send queued behind a warming engine). `provider_error`
    // stays in: its synthetic variant is always `fails_pending`, which the flag
    // check drops first.
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

    // A turn the engine ACCEPTED that emits no output at all: it switches
    // provider, the provider then fails mid-turn (delivered, so the card is
    // unflagged), and the whole thing settles `error`. Every event here was
    // once excluded, so the answers outlived a turn that had already run.
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

    // Frames first: the turn ran, so the unflagged card that follows lands on
    // an already-retired entry.
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
