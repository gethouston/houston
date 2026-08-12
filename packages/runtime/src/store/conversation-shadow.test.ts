import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createConversationStore } from "./conversations";
import {
  type TranscriptShadow,
  type TranscriptShadowOperation,
  TranscriptShadowQueue,
  type TranscriptShadowTransport,
} from "./transcript-shadow";

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "conversation-shadow-"));
  dirs.push(dir);
  return dir;
}

test("user and assistant shadow only after the atomic file write", () => {
  const dir = tempDir();
  const seen: TranscriptShadowOperation[] = [];
  const shadow: TranscriptShadow = {
    enqueue(operation) {
      const stored = JSON.parse(readFileSync(join(dir, "c1.json"), "utf8")) as {
        messages: unknown[];
      };
      expect(stored.messages).toHaveLength(operation.kind === "user" ? 1 : 2);
      seen.push(operation);
    },
  };
  const store = createConversationStore(dir, shadow);

  expect(() =>
    store.appendUserMessage("c1", "hello", { turnId: "t1" }),
  ).not.toThrow();
  expect(() =>
    store.appendAssistantMessage("c1", "hi", { turnId: "t1" }),
  ).not.toThrow();
  expect(seen.map((operation) => operation.kind)).toEqual([
    "user",
    "assistant",
  ]);
  expect(seen[0]).toMatchObject({
    kind: "user",
    conversationId: "c1",
    turnId: "t1",
    expectedCount: 0,
    needsSessionReplay: false,
  });
});

test("a synchronous shadow enqueue failure cannot fail the file mutation", () => {
  const dir = tempDir();
  const shadow: TranscriptShadow = {
    enqueue() {
      throw new Error("broken shadow adapter");
    },
  };
  const store = createConversationStore(dir, shadow);

  expect(() =>
    store.appendUserMessage("c1", "file wins", { turnId: "t1" }),
  ).not.toThrow();
  expect(JSON.parse(readFileSync(join(dir, "c1.json"), "utf8"))).toMatchObject({
    messages: [{ content: "file wins" }],
  });
});

test("a failed shadow write never throws and repairs before the next turn", async () => {
  const dir = tempDir();
  const sent: TranscriptShadowOperation[] = [];
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
  const shadow = new TranscriptShadowQueue(transport);
  const store = createConversationStore(dir, shadow);

  expect(() =>
    store.appendUserMessage("c1", "first", { turnId: "t1" }),
  ).not.toThrow();
  await shadow.flush();
  expect(shadow.isDirty("c1")).toBe(true);

  store.appendUserMessage("c1", "second", { turnId: "t2" });
  await shadow.flush();

  expect(sent.map((operation) => operation.kind)).toEqual(["user", "repair"]);
  expect(sent[1]).toMatchObject({
    kind: "repair",
    conversation: { messages: [{ content: "first" }, { content: "second" }] },
  });
  expect(shadow.isDirty("c1")).toBe(false);
});
