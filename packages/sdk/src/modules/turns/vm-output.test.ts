import { afterEach, expect, test, vi } from "vitest";
import { ScopeStore } from "../../store";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

/**
 * The built-in conversation VM fold: streaming text updates one entry in place,
 * its final flush finalizes the SAME entry (one bubble, not a duplicate), and
 * session status drives `running`/`sessionStatus` on the `conversation/<id>`
 * scope.
 */

function harness() {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  const snap = () =>
    store.getSnapshot(conversationScope("a", "c1")) as ConversationVM;
  return { store, vm, snap };
}

test("streaming text updates one feed entry in place, keeping a stable id", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "He",
  });
  const firstId = snap().feed[0]?.id;
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "Hello",
  });

  expect(snap().feed).toHaveLength(1);
  expect(snap().feed[0]?.id).toBe(firstId); // same entry, updated in place
  expect(snap().feed[0]?.data).toBe("Hello");
});

test("the final assistant_text finalizes the streaming entry, never duplicates it", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "Hi",
  });
  vm.pushFeedItem("a", "c1", { feed_type: "assistant_text", data: "Hi there" });

  expect(snap().feed).toHaveLength(1);
  expect(snap().feed[0]?.feed_type).toBe("assistant_text");
  expect(snap().feed[0]?.data).toBe("Hi there");
});

test("non-streaming items append with fresh stable ids", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "tool_call",
    data: { name: "read", input: {} },
  });
  vm.pushFeedItem("a", "c1", {
    feed_type: "tool_result",
    data: { content: "", is_error: false },
  });

  expect(snap().feed).toHaveLength(2);
  const ids = snap().feed.map((f) => f.id);
  expect(new Set(ids).size).toBe(2); // distinct, stable ids
});

test("session status drives running + sessionStatus and publishes reactively", () => {
  const { store, vm } = harness();
  const seen: ConversationVM[] = [];
  store.subscribe(conversationScope("a", "c1"), (s) =>
    seen.push(s as ConversationVM),
  );

  vm.sessionStatus("a", "c1", "running");
  vm.sessionStatus("a", "c1", "completed");

  expect(seen.map((s) => s.running)).toEqual([true, false]);
  expect(seen.at(-1)?.sessionStatus).toBe("completed");
});

test("a terminal status closes the streaming run so the next turn opens a fresh bubble", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "one",
  });
  vm.sessionStatus("a", "c1", "completed");
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "two",
  });

  expect(snap().feed).toHaveLength(2); // not merged into the first turn's bubble
  expect(snap().feed[0]?.data).toBe("one");
  expect(snap().feed[1]?.data).toBe("two");
});

test("persistBoardStatus folds boardStatus into the VM (handled-vs-error signal)", async () => {
  const { snap, vm } = harness();
  await vm.persistBoardStatus("a", "c1", "needs_you");
  expect(snap().boardStatus).toBe("needs_you"); // published, not a no-op

  await vm.persistBoardStatus("a", "c1", "error");
  expect(snap().boardStatus).toBe("error");
});

test("a user Stop settles boardStatus needs_you while sessionStatus is error", async () => {
  // The turn machinery's handled-error settle: an `error` sessionStatus (clears
  // the loading flag) paired with a `needs_you` board persist. A native shell
  // must read boardStatus to avoid rendering a normal Stop red.
  const { snap, vm } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "system_message",
    data: "Stopped by user",
  });
  vm.sessionStatus("a", "c1", "error");
  await vm.persistBoardStatus("a", "c1", "needs_you");

  expect(snap().sessionStatus).toBe("error");
  expect(snap().boardStatus).toBe("needs_you"); // handled, not a real failure
  expect(snap().running).toBe(false);
});

test("running is derived from sessionStatus, and boardStatus defaults to null", () => {
  const { snap, vm } = harness();
  vm.pushFeedItem("a", "c1", { feed_type: "system_message", data: "hi" });
  expect(snap().running).toBe(false);
  expect(snap().boardStatus).toBe(null); // no board persist yet
  expect(snap().pendingInteraction).toBe(null); // no interaction yet
  vm.sessionStatus("a", "c1", "running");
  expect(snap().running).toBe(true);
});

test("a clean settle folds the pending interaction into the VM; turn start clears it", async () => {
  const { snap, vm } = harness();
  const interaction = {
    steps: [
      {
        kind: "question" as const,
        id: "q1",
        question: "Which one?",
        options: [{ id: "a", label: "A" }],
      },
    ],
  };
  // Settle carrying the interaction: needs_you + the interaction on the VM.
  await vm.persistBoardStatus("a", "c1", "needs_you", interaction);
  expect(snap().boardStatus).toBe("needs_you");
  expect(snap().pendingInteraction).toEqual(interaction);

  // Turn start re-runs the card: running + null clears the stored interaction.
  await vm.persistBoardStatus("a", "c1", "running", null);
  expect(snap().boardStatus).toBe("running");
  expect(snap().pendingInteraction).toBe(null);
});

test("a clean settle with no interaction lands boardStatus done and no interaction", async () => {
  const { snap, vm } = harness();
  await vm.persistBoardStatus("a", "c1", "done", null);
  expect(snap().boardStatus).toBe("done");
  expect(snap().pendingInteraction).toBe(null);
});

afterEach(() => {
  vi.useRealTimers();
});

test("a live push without ts is stamped Date.now() at push time", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", { feed_type: "system_message", data: "hi" });
  expect(snap().feed[0]?.ts).toBe(1_700_000_000_000);
});

test("a live push carrying a ts keeps it (not re-stamped)", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "system_message",
    data: "hi",
    ts: 42,
  });
  expect(snap().feed[0]?.ts).toBe(42); // the supplied ts wins over the clock
});

test("a streaming update keeps the entry's original ts through finalization", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "He",
  });
  const openedTs = snap().feed[0]?.ts;
  expect(openedTs).toBe(1000); // stamped when the stream opened

  // Later deltas (and the final flush) arrive with the wall clock advanced —
  // the entry keeps the ts it opened with, never re-stamps per delta.
  vi.setSystemTime(9999);
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "Hello",
  });
  expect(snap().feed[0]?.ts).toBe(openedTs);

  vm.pushFeedItem("a", "c1", { feed_type: "assistant_text", data: "Hello!" });
  expect(snap().feed).toHaveLength(1);
  expect(snap().feed[0]?.feed_type).toBe("assistant_text");
  expect(snap().feed[0]?.ts).toBe(openedTs); // finalization preserves it
});

test("seedHistory carries a frame's ts through and stamps nothing when absent", () => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
  const { vm, snap } = harness();
  vm.seedHistory("a", "c1", [
    { feed_type: "user_message", data: "hi", ts: 111 },
    { feed_type: "assistant_text", data: "yo" }, // pre-ts transcript: no ts
  ]);
  expect(snap().feed[0]?.ts).toBe(111); // historical ts preserved
  expect(snap().feed[1]?.ts).toBeUndefined(); // NOT stamped with the wall clock
});

// ── Optimistic pending flag (WhatsApp clock -> check) ────────────────────────

test("an optimistic push carries pending; the first later push clears it (same id)", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "hi",
    pending: true,
  });
  const bubbleId = snap().feed[0]?.id;
  expect(snap().feed[0]?.pending).toBe(true); // unconfirmed until server evidence

  // The FIRST subsequent push is that evidence: the bubble is confirmed in place.
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "y",
  });
  expect(snap().feed[0]?.id).toBe(bubbleId); // same entry, stripped in place
  expect("pending" in (snap().feed[0] ?? {})).toBe(false); // flag gone, not undefined
});

test("a settle (completed/error) clears pending with no intervening feed push", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "hi",
    pending: true,
  });
  vm.sessionStatus("a", "c1", "completed");
  expect(snap().feed[0]?.pending).toBeUndefined();

  // Same for the error settle (a rejected/lost send).
  const { vm: vm2, snap: snap2 } = harness();
  vm2.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "hi",
    pending: true,
  });
  vm2.sessionStatus("a", "c1", "error");
  expect(snap2().feed[0]?.pending).toBeUndefined();
});

test("a running status does NOT clear pending (only a terminal status does)", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "hi",
    pending: true,
  });
  vm.sessionStatus("a", "c1", "running");
  expect(snap().feed[0]?.pending).toBe(true); // still unconfirmed
});

test("a second optimistic push keeps its sibling pending; server evidence clears ALL", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "one",
    pending: true,
  });
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "two",
    pending: true,
  });
  // Both queued prompts keep their clock — an optimistic push is not evidence.
  expect(snap().feed.map((f) => f.pending)).toEqual([true, true]);

  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "y",
  });
  expect(snap().feed.filter((f) => f.pending)).toHaveLength(0); // all confirmed at once
});

test("seedHistory frames never carry pending (a resumed/observed chat shows no clock)", () => {
  const { vm, snap } = harness();
  vm.seedHistory("a", "c1", [
    { feed_type: "user_message", data: "hi", ts: 1 },
    { feed_type: "assistant_text", data: "yo", ts: 2 },
  ]);
  expect(snap().feed.some((f) => f.pending)).toBe(false);
});

// ── Failed delivery (a send that never landed must NOT read "Sent") ──────────

test("a fails_pending push marks a still-pending bubble failed, never confirmed", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "hi",
    pending: true,
  });
  const bubbleId = snap().feed[0]?.id;
  // A client-generated send-failure notice (lost/rejected send): it is NOT
  // server evidence, so it must fail the clock, not flip it to a "Sent" check.
  vm.pushFeedItem("a", "c1", {
    feed_type: "system_message",
    data: "lost",
    fails_pending: true,
  });
  expect(snap().feed[0]?.id).toBe(bubbleId); // same entry, updated in place
  expect(snap().feed[0]?.pending).toBeUndefined(); // no longer in flight
  expect(snap().feed[0]?.failed).toBe(true); // undelivered → an error tick
  // The control flag never leaks onto the stored notice entry.
  expect("fails_pending" in (snap().feed[1] ?? {})).toBe(false);
  expect(snap().feed[1]?.failed).toBeUndefined();
});

test("a normal server push confirms pending (check) and never sets failed", () => {
  const { vm, snap } = harness();
  vm.pushFeedItem("a", "c1", {
    feed_type: "user_message",
    data: "hi",
    pending: true,
  });
  vm.pushFeedItem("a", "c1", {
    feed_type: "assistant_text_streaming",
    data: "y",
  });
  expect(snap().feed[0]?.pending).toBeUndefined();
  expect(snap().feed[0]?.failed).toBeUndefined();
});

test("distinct conversations get distinct scopes", () => {
  const { store, vm } = harness();
  vm.pushFeedItem("a", "c1", { feed_type: "system_message", data: "one" });
  vm.pushFeedItem("a", "c2", { feed_type: "system_message", data: "two" });

  expect(
    (store.getSnapshot(conversationScope("a", "c1")) as ConversationVM).feed,
  ).toHaveLength(1);
  expect(
    (store.getSnapshot(conversationScope("a", "c2")) as ConversationVM).feed,
  ).toHaveLength(1);
});

test("the same session key on two agents never collides (agent-qualified scope)", () => {
  // Session keys are unique only WITHIN one agent (e.g. two agents each with
  // an `activity-1` conversation) — the scope must keep them apart (ADR-0001).
  const { store, vm } = harness();
  vm.pushFeedItem("Houston/Bo", "activity-1", {
    feed_type: "system_message",
    data: "bo's",
  });
  vm.pushFeedItem("Houston/Ada", "activity-1", {
    feed_type: "system_message",
    data: "ada's",
  });

  const bo = store.getSnapshot(
    conversationScope("Houston/Bo", "activity-1"),
  ) as ConversationVM;
  const ada = store.getSnapshot(
    conversationScope("Houston/Ada", "activity-1"),
  ) as ConversationVM;
  expect(bo.feed).toHaveLength(1);
  expect(bo.feed[0]?.data).toBe("bo's");
  expect(ada.feed).toHaveLength(1);
  expect(ada.feed[0]?.data).toBe("ada's");
});

test("confirmIdle clears a STALE running flag (stream died without a settle)", () => {
  const { vm, snap } = harness();
  vm.sessionStatus("a", "c1", "running");
  expect(snap().running).toBe(true);

  // The stream was torn down externally (client teardown settles nothing);
  // an observer later attaches and the server confirms the conversation idle.
  vm.confirmIdle("a", "c1");
  expect(snap().running).toBe(false);
  expect(snap().sessionStatus).toBe("idle");
});

test("confirmIdle leaves a settled conversation untouched", () => {
  const { vm, snap } = harness();
  vm.sessionStatus("a", "c1", "running");
  vm.sessionStatus("a", "c1", "error");

  vm.confirmIdle("a", "c1");
  // The terminal truth stays — only a stale "running" is reconciled.
  expect(snap().sessionStatus).toBe("error");
});

// ── Transcript windowing (HOU-819) ──────────────────────────────────────────

test("seedHistory with a window stamps historyWindow on the snapshot", () => {
  const { vm, snap } = harness();
  vm.seedHistory(
    "a",
    "c1",
    [{ feed_type: "user_message", data: "hi", ts: 100 }],
    { earliestLoaded: 380, total: 381 },
  );

  expect(snap().historyWindow).toEqual({ earliestLoaded: 380, total: 381 });
});

test("seedHistory without a window CLEARS a stale stamp (feed no longer maps to it)", () => {
  const { vm, snap } = harness();
  vm.seedHistory("a", "c1", [{ feed_type: "user_message", data: "hi" }], {
    earliestLoaded: 10,
    total: 11,
  });
  vm.seedHistory("a", "c1", [{ feed_type: "user_message", data: "hi" }]);

  expect(snap().historyWindow).toBeUndefined();
});

test("prependHistory inserts older frames BEFORE the feed and updates the window", () => {
  const { vm, snap } = harness();
  vm.seedHistory(
    "a",
    "c1",
    [{ feed_type: "user_message", data: "newer", ts: 200 }],
    { earliestLoaded: 80, total: 81 },
  );
  vm.prependHistory(
    "a",
    "c1",
    [
      { feed_type: "user_message", data: "oldest", ts: 50 },
      { feed_type: "assistant_text", data: "older reply", ts: 60 },
    ],
    { earliestLoaded: 0, total: 81 },
  );

  expect(snap().feed.map((f) => f.data)).toEqual([
    "oldest",
    "older reply",
    "newer",
  ]);
  expect(snap().historyWindow).toEqual({ earliestLoaded: 0, total: 81 });
});

test("prependHistory keeps the existing entries' ids (no remount churn below)", () => {
  const { vm, snap } = harness();
  vm.seedHistory(
    "a",
    "c1",
    [{ feed_type: "user_message", data: "kept", ts: 200 }],
    { earliestLoaded: 5, total: 6 },
  );
  const keptId = snap().feed[0]?.id;
  vm.prependHistory(
    "a",
    "c1",
    [{ feed_type: "user_message", data: "older", ts: 10 }],
    { earliestLoaded: 0, total: 6 },
  );

  expect(snap().feed[1]?.id).toBe(keptId);
});

test("stampHistoryWindow records the window without touching the feed", () => {
  const { vm, snap } = harness();
  vm.seedHistory("a", "c1", [
    { feed_type: "user_message", data: "painted", ts: 100 },
  ]);
  const feedBefore = snap().feed;
  vm.stampHistoryWindow("a", "c1", { earliestLoaded: 42, total: 142 });

  expect(snap().historyWindow).toEqual({ earliestLoaded: 42, total: 142 });
  expect(snap().feed).toEqual(feedBefore);
});

test("stampHistoryWindow with an unchanged window does not republish", () => {
  const { store, vm } = harness();
  vm.stampHistoryWindow("a", "c1", { earliestLoaded: 1, total: 2 });
  const listener = vi.fn();
  store.subscribe(conversationScope("a", "c1"), listener);
  vm.stampHistoryWindow("a", "c1", { earliestLoaded: 1, total: 2 });

  expect(listener).not.toHaveBeenCalled();
});
