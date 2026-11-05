import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { buildClaudeEnv } from "./claude-env";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

/**
 * A session the standing server rebuilds after a restart has measured nothing
 * yet. The autocompact check runs before its first turn, so the session must
 * report the fill its conversation's last reply recorded, or a chat already
 * past its compaction point runs one more turn uncompacted.
 */

function session(input: {
  recorded?: number;
  clearedTokens?: number;
  resumes?: boolean;
}) {
  const resumes = input.resumes ?? true;
  const store: SessionsStore = {
    getSessionId: () => (resumes ? "sess-1" : undefined),
    setSessionId: () => {},
    remove: () => {},
    purge: () => {},
    resolveResume: () =>
      resumes
        ? { sessionId: "sess-1", clearedTokens: input.clearedTokens ?? 0 }
        : undefined,
  };
  const query: ClaudeQuery = async function* (): AsyncIterable<SDKMessage> {};
  return new ClaudeSession({
    query,
    conversationId: "c1",
    baseOptions: {} as Options,
    sessionsStore: store,
    model: "claude-sonnet-5-5",
    refreshAuth: (promptTokens) => ({
      env: buildClaudeEnv(undefined, { configDir: "/config", promptTokens }),
    }),
    ...(input.recorded === undefined
      ? {}
      : { recordedContextTokens: () => input.recorded }),
  });
}

test("a rebuilt session reports the fill its last reply recorded", () => {
  expect(session({ recorded: 33_761 }).getContextUsage()).toEqual({
    tokens: 33_761,
  });
});

test("stale tool results cleared before the check come off the recorded fill", () => {
  const claude = session({ recorded: 33_761, clearedTokens: 10_000 });
  claude.clearStaleToolResults();
  expect(claude.getContextUsage()).toEqual({ tokens: 23_761 });
});

test("a conversation with no recorded fill stays unknown", () => {
  expect(session({}).getContextUsage()).toBeUndefined();
});

test("a session that starts fresh ignores the old recorded fill", () => {
  // A backend switch, a routine reset or edit-and-resend drops the SDK
  // session: the next prompt replays far less, and there is nothing to compact.
  expect(
    session({ recorded: 190_000, resumes: false }).getContextUsage(),
  ).toBeUndefined();
});
