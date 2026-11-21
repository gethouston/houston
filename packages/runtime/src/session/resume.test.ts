import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";

const WORKSPACE = mkdtempSync(join(tmpdir(), "houston-ws-"));
const SECRET = "the magic launch code is 4242";

function userMsg(content: string) {
  return { role: "user" as const, content, timestamp: Date.now() };
}

function assistantMsg(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

function freshSessionDir() {
  return join(
    mkdtempSync(join(tmpdir(), "houston-data-")),
    "sessions",
    "conv-1",
  );
}

function turn(mgr: SessionManager, prompt: string, reply: string) {
  mgr.appendMessage(userMsg(prompt));
  mgr.appendMessage(assistantMsg(reply));
}

test("a fresh process resumes the conversation from disk (the fix)", () => {
  const sessionDir = freshSessionDir();

  const first = SessionManager.create(WORKSPACE, sessionDir);
  turn(first, SECRET, "Noted.");
  expect(first.buildSessionContext().messages).toHaveLength(2);

  const woken = SessionManager.continueRecent(WORKSPACE, sessionDir);
  const restored = woken.buildSessionContext().messages;

  expect(restored).toHaveLength(2);
  expect(JSON.stringify(restored)).toContain("4242");
});

test("the old create()-on-restart path silently loses history (the bug it replaces)", () => {
  const sessionDir = freshSessionDir();

  const first = SessionManager.create(WORKSPACE, sessionDir);
  turn(first, SECRET, "Noted.");
  expect(first.buildSessionContext().messages).toHaveLength(2);

  const reCreated = SessionManager.create(WORKSPACE, sessionDir);
  expect(reCreated.buildSessionContext().messages).toHaveLength(0);
});

test("continueRecent() on an empty dir starts a new session (first-ever turn)", () => {
  const sessionDir = freshSessionDir();
  const fresh = SessionManager.continueRecent(WORKSPACE, sessionDir);
  expect(fresh.buildSessionContext().messages).toHaveLength(0);
});

test("many turns all survive a wake", () => {
  const sessionDir = freshSessionDir();

  const live = SessionManager.create(WORKSPACE, sessionDir);
  turn(live, "turn one", "ok one");
  turn(live, "turn two", "ok two");
  turn(live, "turn three", "ok three");

  const woken = SessionManager.continueRecent(WORKSPACE, sessionDir);
  expect(woken.buildSessionContext().messages).toHaveLength(6);
});
