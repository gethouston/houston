import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { StoredConversation } from "./conversation-file";
import type {
  TranscriptShadowOperation,
  TranscriptShadowSend,
  TranscriptShadowTransport,
} from "./transcript-shadow";
import {
  MAX_PENDING_OPERATIONS,
  TranscriptShadowQueue,
} from "./transcript-shadow-queue";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function message(n: number): ChatMessage {
  return { role: "user", content: `m${n}`, ts: n };
}

function userOp(conversationId: string, n: number): TranscriptShadowOperation {
  return {
    kind: "user",
    conversationId,
    turnId: `t${n}`,
    message: message(n),
    title: "chat",
    expectedCount: n - 1,
  };
}

function conversation(messages: ChatMessage[]): StoredConversation {
  return { id: "c1", title: "chat", createdAt: 0, updatedAt: 0, messages };
}

/** Transport whose sends resolve/reject only when the test releases them. */
function manualTransport() {
  const sent: TranscriptShadowSend[] = [];
  const gates: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  const transport: TranscriptShadowTransport = {
    send(operation) {
      sent.push(operation);
      return new Promise<void>((resolve, reject) =>
        gates.push({ resolve, reject }),
      );
    },
  };
  return { transport, sent, gates };
}

test("per-conversation ordering survives a slow transport", async () => {
  const { transport, sent, gates } = manualTransport();
  const queue = new TranscriptShadowQueue(transport, () => conversation([]));

  queue.enqueue(userOp("c1", 1));
  queue.enqueue(userOp("c1", 2));
  queue.enqueue(userOp("c1", 3));
  await tick();
  expect(sent).toHaveLength(1); // serialized: one in flight at a time
  while (gates.length) {
    gates.shift()?.resolve();
    await tick();
  }
  expect(
    sent.map((op) => (op.kind === "user" ? op.message.content : op.kind)),
  ).toEqual(["m1", "m2", "m3"]);
});

test("pending ops past the cap collapse into a single repair", async () => {
  const source = conversation([message(1)]);
  const { transport, sent, gates } = manualTransport();
  const queue = new TranscriptShadowQueue(transport, () => source);

  queue.enqueue(userOp("c1", 1)); // goes in flight, held by the gate
  await tick();
  for (let n = 2; n <= MAX_PENDING_OPERATIONS + 3; n += 1) {
    source.messages.push(message(n));
    queue.enqueue(userOp("c1", n));
  }
  while (gates.length) {
    gates.shift()?.resolve();
    await tick();
  }
  expect(sent.map((op) => op.kind)).toEqual(["user", "repair"]);
  const repair = sent[1];
  if (repair?.kind !== "repair") throw new Error("expected a repair");
  // The snapshot is read from the file at send time and covers every
  // collapsed op — and it is a clone, not the live mutable object.
  expect(repair.conversation.messages).toHaveLength(MAX_PENDING_OPERATIONS + 3);
  expect(repair.conversation).not.toBe(source);
  expect(queue.isDirty("c1")).toBe(false);
});

test("repair snapshots stay drain-aware while appends continue", async () => {
  const file: { current: StoredConversation | null } = {
    current: conversation([message(1)]),
  };
  const { transport, sent, gates } = manualTransport();
  const queue = new TranscriptShadowQueue(transport, () => file.current);

  queue.enqueue(userOp("c1", 1));
  await tick();
  gates.shift()?.reject(new Error("gateway unavailable"));
  await tick();
  expect(queue.isDirty("c1")).toBe(true);

  // Next mutation collapses to a repair; its snapshot is taken at send time.
  file.current?.messages.push(message(2));
  queue.enqueue(userOp("c1", 2));
  await tick();
  // While that repair is in flight, the file keeps moving.
  file.current?.messages.push(message(3));
  queue.enqueue(userOp("c1", 3));
  while (gates.length) {
    gates.shift()?.resolve();
    await tick();
  }

  expect(sent.map((op) => op.kind)).toEqual(["user", "repair", "repair"]);
  const [, repair1, repair2] = sent;
  if (repair1?.kind !== "repair" || repair2?.kind !== "repair") {
    throw new Error("expected repairs");
  }
  // The first snapshot froze BEFORE the concurrent append: m3 rides the
  // second repair exactly once — never replayed on top of a snapshot that
  // already contains it.
  expect(repair1.conversation.messages.map((m) => m.content)).toEqual([
    "m1",
    "m2",
  ]);
  expect(repair2.conversation.messages.map((m) => m.content)).toEqual([
    "m1",
    "m2",
    "m3",
  ]);
  expect(queue.isDirty("c1")).toBe(false);
});

test("a queued repair resolves to a delete when the file is gone", async () => {
  const { transport, sent, gates } = manualTransport();
  const queue = new TranscriptShadowQueue(transport, () => null);

  queue.enqueue({ kind: "repair", conversationId: "c1" });
  await tick();
  gates.shift()?.resolve();
  await queue.flush();
  expect(sent.map((op) => op.kind)).toEqual(["delete"]);
});

test("a delete supersedes everything queued behind it", async () => {
  const { transport, sent, gates } = manualTransport();
  const queue = new TranscriptShadowQueue(transport, () => conversation([]));

  queue.enqueue(userOp("c1", 1)); // in flight
  await tick();
  queue.enqueue(userOp("c1", 2));
  queue.enqueue({ kind: "rename", conversationId: "c1", title: "renamed" });
  queue.enqueue({ kind: "delete", conversationId: "c1" });
  while (gates.length) {
    gates.shift()?.resolve();
    await tick();
  }
  expect(sent.map((op) => op.kind)).toEqual(["user", "delete"]);
});

test("drainForShutdown resolves within its cap while the gateway hangs", async () => {
  const { transport } = manualTransport(); // gates never released
  const queue = new TranscriptShadowQueue(transport, () => conversation([]));

  queue.enqueue(userOp("c1", 1));
  const started = Date.now();
  await queue.drainForShutdown(50);
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("drainForShutdown gives dirty conversations a final repair", async () => {
  const source = conversation([message(1)]);
  const sent: TranscriptShadowSend[] = [];
  let failFirst = true;
  const transport: TranscriptShadowTransport = {
    async send(operation) {
      sent.push(operation);
      if (failFirst) {
        failFirst = false;
        throw new Error("gateway unavailable");
      }
    },
  };
  const queue = new TranscriptShadowQueue(transport, () => source);

  queue.enqueue(userOp("c1", 1));
  await queue.flush();
  expect(queue.isDirty("c1")).toBe(true);

  await queue.drainForShutdown(1_000);
  expect(sent.map((op) => op.kind)).toEqual(["user", "repair"]);
  expect(queue.isDirty("c1")).toBe(false);
});
