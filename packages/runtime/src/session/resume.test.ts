import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

/**
 * De-risks cloud sleep/wake (Phase 9): when a sandbox is killed on idle and a
 * fresh process answers the next message, the conversation MUST come back.
 *
 * This pins the exact behavior `chat.ts:getConversation` depends on, at the exact
 * API surface `createAgentSession` consumes (`buildSessionContext().messages`,
 * which the SDK assigns to `agent.state.messages` when `hasExistingSession`).
 *
 * Note pi only persists a session once it holds an assistant message (it won't
 * litter disk with unanswered prompts), so each "turn" here is a user + assistant
 * pair — exactly what `session.prompt()` produces in real use.
 */

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

/** A fresh per-conversation session dir, mirroring `dataDir/sessions/<id>`. */
function freshSessionDir() {
  return join(
    mkdtempSync(join(tmpdir(), "houston-data-")),
    "sessions",
    "conv-1",
  );
}

/** Drive one real turn (user prompt + assistant reply) through a manager. */
function turn(mgr: SessionManager, prompt: string, reply: string) {
  mgr.appendMessage(userMsg(prompt));
  mgr.appendMessage(assistantMsg(reply));
}

test("a fresh process resumes the conversation from disk (the fix)", () => {
  const sessionDir = freshSessionDir();

  // Process #1: one real turn, persisted to disk.
  const first = SessionManager.create(WORKSPACE, sessionDir);
  turn(first, SECRET, "Noted.");
  expect(first.buildSessionContext().messages).toHaveLength(2);

  // Process #2 (runtime restart / sandbox woken from sleep): NOTHING in memory.
  // continueRecent() reopens the most recent session in this conversation's dir.
  const woken = SessionManager.continueRecent(WORKSPACE, sessionDir);
  const restored = woken.buildSessionContext().messages;

  expect(restored).toHaveLength(2);
  expect(JSON.stringify(restored)).toContain("4242"); // the model would see the prior turn
});

test("the old create()-on-restart path silently loses history (the bug it replaces)", () => {
  const sessionDir = freshSessionDir();

  const first = SessionManager.create(WORKSPACE, sessionDir);
  turn(first, SECRET, "Noted.");
  expect(first.buildSessionContext().messages).toHaveLength(2);

  // What chat.ts did before: create() again on the same dir mints a NEW empty
  // session — the prior turn is on disk but invisible to the agent.
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
