import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { decodeActingAuthor } from "../session/attribution";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  deleteConversationAt,
  getHistoryAt,
  listConversationsAt,
  loadConversation,
  renameConversationAt,
} from "./conversation-file";

/** Mint an `acting-v1.<payloadB64Url>.<sig>` token carrying `payload` (C2). */
function actingToken(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `acting-v1.${b64}.sig`;
}

const freshDir = () => mkdtempSync(join(tmpdir(), "houston-conv-"));

test("rename persists the new title and bumps updatedAt", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hello there, long opening message");
  const before = loadConversation(dir, "c1");
  if (!before) throw new Error("loadConversation returned null after append");

  expect(renameConversationAt(dir, "c1", "Quarterly report")).toBe(true);

  const after = loadConversation(dir, "c1");
  if (!after) throw new Error("loadConversation returned null after rename");
  expect(after.title).toBe("Quarterly report");
  expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  expect(after.messages).toHaveLength(1); // transcript untouched
  expect(listConversationsAt(dir)[0]?.title).toBe("Quarterly report");
});

test("rename of an unknown conversation reports failure, writes nothing", () => {
  const dir = freshDir();
  expect(renameConversationAt(dir, "ghost", "nope")).toBe(false);
  expect(listConversationsAt(dir)).toHaveLength(0);
});

test("delete removes the transcript file; list and history no longer see it", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "hello!");
  appendUserMessageAt(dir, "c2", "other");

  expect(deleteConversationAt(dir, "c1")).toBe(true);

  expect(existsSync(join(dir, "c1.json"))).toBe(false);
  expect(getHistoryAt(dir, "c1")).toBeNull();
  expect(listConversationsAt(dir).map((c) => c.id)).toEqual(["c2"]);
});

test("delete of an unknown conversation reports failure (404 at the route)", () => {
  const dir = freshDir();
  expect(deleteConversationAt(dir, "ghost")).toBe(false);
});

test("delete then re-append starts a fresh conversation, not a resurrected one", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "first life");
  deleteConversationAt(dir, "c1");
  appendUserMessageAt(dir, "c1", "second life");

  const conv = loadConversation(dir, "c1");
  if (!conv) throw new Error("loadConversation returned null after append");
  expect(conv.messages).toHaveLength(1);
  expect(conv.messages[0]?.content).toBe("second life");
});

test("assistant message persists token usage so the indicator survives a reload", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "hello!", {
    usage: { context_tokens: 12345, output_tokens: 67, cached_tokens: 89 },
  });

  const history = getHistoryAt(dir, "c1");
  if (!history) throw new Error("getHistoryAt returned null after append");
  const msg = history.messages.find((m) => m.role === "assistant");
  if (!msg) throw new Error("no assistant message found in history");
  expect(msg.usage).toEqual({
    context_tokens: 12345,
    output_tokens: 67,
    cached_tokens: 89,
  });
});

test("assistant message without usage stores no usage field (degrades cleanly)", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "hello!");

  const history = getHistoryAt(dir, "c1");
  if (!history) throw new Error("getHistoryAt returned null after append");
  const msg = history.messages.find((m) => m.role === "assistant");
  if (!msg) throw new Error("no assistant message found in history");
  expect(msg.usage ?? null).toBeNull();
});

test("assistant message persists the provider-switch marker so the divider survives a reload", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "now on the new provider", {
    providerSwitch: {
      provider: "openai-codex",
      summarized: true,
      pre_tokens: 280_000,
    },
  });

  const history = getHistoryAt(dir, "c1");
  if (!history) throw new Error("getHistoryAt returned null after append");
  const msg = history.messages.find((m) => m.role === "assistant");
  if (!msg) throw new Error("no assistant message found in history");
  expect(msg.providerSwitch).toEqual({
    provider: "openai-codex",
    summarized: true,
    pre_tokens: 280_000,
  });
});

test("assistant message with no switch stores no providerSwitch field", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "hello!");

  const msg = getHistoryAt(dir, "c1")?.messages.find(
    (m) => m.role === "assistant",
  );
  expect(msg?.providerSwitch ?? null).toBeNull();
});

test("assistant message persists the pending interaction so a reload settles needs_you", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "book it", { turnId: "t-1" });
  appendAssistantMessageAt(dir, "c1", "which date?", {
    turnId: "t-1",
    pendingInteraction: {
      steps: [{ kind: "question", id: "q1", question: "Which date?" }],
    },
  });

  const history = getHistoryAt(dir, "c1");
  if (!history) throw new Error("getHistoryAt returned null after append");
  const msg = history.messages.find((m) => m.role === "assistant");
  if (!msg) throw new Error("no assistant message found in history");
  expect(msg.pendingInteraction).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Which date?" }],
  });
});

test("assistant message with no pending interaction stays interaction-free in the JSON", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "all done");

  const msg = getHistoryAt(dir, "c1")?.messages.find(
    (m) => m.role === "assistant",
  );
  expect(msg?.pendingInteraction ?? null).toBeNull();
  // Absent, not present-and-undefined — a plain turn's record is unchanged.
  const raw = readFileSync(join(dir, "c1.json"), "utf8");
  expect(raw).not.toContain("pendingInteraction");
});

test("a user message from an acting-as token persists its author (C5), served on read-back", () => {
  const dir = freshDir();
  // The runtime decodes WHO the turn acts as off the C2 token, then stamps it.
  const author = decodeActingAuthor(
    actingToken({ sub: "user_ada", name: "Ada", agent: "mercury", exp: 1 }),
  );
  appendUserMessageAt(dir, "c1", "ship the report", { author });

  const msg = getHistoryAt(dir, "c1")?.messages.find((m) => m.role === "user");
  expect(msg?.author).toEqual({ userId: "user_ada", name: "Ada" });
});

test("turnId persists on BOTH messages of a turn (matches the live stream's frames)", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi", { turnId: "t-1" });
  appendAssistantMessageAt(dir, "c1", "hello!", { turnId: "t-1" });

  const messages = getHistoryAt(dir, "c1")?.messages ?? [];
  expect(messages.map((m) => [m.role, m.turnId])).toEqual([
    ["user", "t-1"],
    ["assistant", "t-1"],
  ]);
});

test("messages without a turnId stay turnId-free in the JSON (pre-turn-id records unchanged)", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "hello!");
  const raw = readFileSync(join(dir, "c1.json"), "utf8");
  expect(raw).not.toContain("turnId");
});

test("a user message persists displayText beside content; the model input (content) is untouched", () => {
  const dir = freshDir();
  // `content` is the real prompt the model runs on (a hidden setup directive);
  // `displayText` is only what the bubble renders on a history reload.
  appendUserMessageAt(dir, "c1", "HIDDEN setup directive the user never sees", {
    displayText: "Let's set you up",
  });

  const msg = getHistoryAt(dir, "c1")?.messages.find((m) => m.role === "user");
  expect(msg?.content).toBe("HIDDEN setup directive the user never sees");
  expect(msg?.displayText).toBe("Let's set you up");
});

test("a user message with no displayText stays displayText-free in the JSON (unchanged records)", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "just a normal message");

  const msg = getHistoryAt(dir, "c1")?.messages.find((m) => m.role === "user");
  expect(msg?.displayText).toBeUndefined();
  // Absent, not present-and-undefined — a plain message's record is unchanged.
  const raw = readFileSync(join(dir, "c1.json"), "utf8");
  expect(raw).not.toContain("displayText");
});

test("a user message with no acting-as token stays author-free (byte-identical to today)", () => {
  const dir = freshDir();
  // No token → decode yields undefined → no author stamped.
  const author = decodeActingAuthor(undefined);
  appendUserMessageAt(dir, "c1", "ship the report", { author });

  const msg = getHistoryAt(dir, "c1")?.messages.find((m) => m.role === "user");
  expect(msg?.author).toBeUndefined();
  // The `author` key must be ABSENT from the JSON, not present-and-undefined,
  // so a single-user transcript is byte-identical to before this feature.
  const raw = readFileSync(join(dir, "c1.json"), "utf8");
  expect(raw).not.toContain("author");
});

// ── Transcript windowing (HOU-819) ──────────────────────────────────────────

function seedConversation(dir: string, count: number) {
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) appendUserMessageAt(dir, "c1", `user ${i}`);
    else appendAssistantMessageAt(dir, "c1", `reply ${i}`);
  }
}

test("no window returns the full transcript with offset 0 and the total", () => {
  const dir = freshDir();
  seedConversation(dir, 5);

  const h = getHistoryAt(dir, "c1");
  if (!h) throw new Error("getHistoryAt returned null");
  expect(h.messages).toHaveLength(5);
  expect(h.offset).toBe(0);
  expect(h.totalMessages).toBe(5);
});

test("limit returns the LAST N messages and where they start", () => {
  const dir = freshDir();
  seedConversation(dir, 10);

  const h = getHistoryAt(dir, "c1", { limit: 3 });
  if (!h) throw new Error("getHistoryAt returned null");
  expect(h.messages.map((m) => m.content)).toEqual([
    "reply 7",
    "user 8",
    "reply 9",
  ]);
  expect(h.offset).toBe(7);
  expect(h.totalMessages).toBe(10);
});

test("before + limit returns the previous page, ending at the cursor", () => {
  const dir = freshDir();
  seedConversation(dir, 10);

  const h = getHistoryAt(dir, "c1", { limit: 3, before: 7 });
  if (!h) throw new Error("getHistoryAt returned null");
  expect(h.messages.map((m) => m.content)).toEqual([
    "user 4",
    "reply 5",
    "user 6",
  ]);
  expect(h.offset).toBe(4);
  expect(h.totalMessages).toBe(10);
});

test("a limit larger than the transcript clamps to the start (offset 0)", () => {
  const dir = freshDir();
  seedConversation(dir, 4);

  const h = getHistoryAt(dir, "c1", { limit: 100 });
  if (!h) throw new Error("getHistoryAt returned null");
  expect(h.messages).toHaveLength(4);
  expect(h.offset).toBe(0);
});

test("a before cursor past the end clamps to the transcript's tail", () => {
  const dir = freshDir();
  seedConversation(dir, 4);

  const h = getHistoryAt(dir, "c1", { limit: 2, before: 999 });
  if (!h) throw new Error("getHistoryAt returned null");
  expect(h.messages.map((m) => m.content)).toEqual(["user 2", "reply 3"]);
  expect(h.offset).toBe(2);
});

test("before at the transcript start returns an empty page (nothing older)", () => {
  const dir = freshDir();
  seedConversation(dir, 4);

  const h = getHistoryAt(dir, "c1", { limit: 2, before: 0 });
  if (!h) throw new Error("getHistoryAt returned null");
  expect(h.messages).toHaveLength(0);
  expect(h.offset).toBe(0);
  expect(h.totalMessages).toBe(4);
});
