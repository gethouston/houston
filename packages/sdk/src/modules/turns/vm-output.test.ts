import { expect, test } from "vitest";
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
