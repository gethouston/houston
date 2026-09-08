import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

/**
 * Compaction on the Claude Agent SDK backend: a summarization turn inside the
 * conversation's own session, then a restart on the summary (./compact).
 *
 * What these tests hold onto is the pair of promises the feature makes — a
 * compaction the caller records really happened, and a compaction that FAILS
 * costs the user nothing. Driven by a scripted `query`, so no binary and no
 * network, exactly like session.test.ts.
 */

function textMsg(text: string, sessionId = "s"): SDKMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    session_id: sessionId,
    parent_tool_use_id: null,
  } as unknown as SDKMessage;
}

function usageMsg(contextTokens: number, sessionId = "s"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    usage: {
      input_tokens: contextTokens,
      output_tokens: 20,
      cache_read_input_tokens: 0,
    },
    session_id: sessionId,
  } as unknown as SDKMessage;
}

/** The SDK's shape for a turn the provider refused. */
const errorMsg = {
  type: "assistant",
  error: "authentication_failed",
  message: { role: "assistant", model: "claude-sonnet-4-6", content: [] },
  parent_tool_use_id: null,
  session_id: "s",
} as unknown as SDKMessage;

type Call = { prompt: string; options: Options };

/** A store whose mapping is real, so a dropped session is observable. */
function store(
  sessionId?: string,
): SessionsStore & { id: () => string | undefined } {
  let current = sessionId;
  return {
    id: () => current,
    getSessionId: () => current,
    setSessionId: (_c, s) => {
      current = s;
    },
    remove: () => {
      current = undefined;
    },
    purge: () => {},
    resolveResume: () => current,
  };
}

function scripted(script: (call: Call) => SDKMessage[]): {
  query: ClaudeQuery;
  calls: Call[];
} {
  const calls: Call[] = [];
  const query: ClaudeQuery = (params) => {
    const call = { prompt: params.prompt, options: params.options };
    calls.push(call);
    const msgs = script(call);
    return (async function* () {
      for (const m of msgs) {
        await Promise.resolve();
        yield m;
      }
    })();
  };
  return { query, calls };
}

function make(query: ClaudeQuery, sessions: SessionsStore): ClaudeSession {
  return new ClaudeSession({
    query,
    conversationId: "c1",
    baseOptions: { tools: ["Bash"], allowedTools: ["mcp__houston"] } as Options,
    sessionsStore: sessions,
    model: "claude-sonnet-4-6",
    refreshAuth: () => ({ env: { CLAUDE_CODE_OAUTH_TOKEN: "t" } }),
  });
}

test("compaction summarizes the live session and returns the summary", async () => {
  const sessions = store("sdk-1");
  const { query, calls } = scripted(() => [
    textMsg("They are planning a trip to Lisbon in May."),
    usageMsg(400),
  ]);
  const session = make(query, sessions);

  const outcome = await session.compact();

  // The summary is the whole point: it is what the fresh session is seeded
  // with, and what the assistant's durable-fact harvest reads.
  expect(outcome?.summary).toContain("Lisbon");
  // Summarized IN the conversation's own session — a summary of nothing would
  // be worse than no compaction at all.
  expect(calls[0]?.options.resume).toBe("sdk-1");
  // ...and the restart: the mapping is gone, so the next turn opens fresh.
  expect(sessions.id()).toBeUndefined();
});

test("the summarizer is given no tools and says nothing on the wire", async () => {
  const { query, calls } = scripted(() => [textMsg("a summary"), usageMsg(10)]);
  const session = make(query, store("sdk-1"));
  const seen: WireEvent[] = [];
  session.subscribe((e) => seen.push(e));

  await session.compact();

  // A summarizer that reaches for a tool stops summarizing.
  expect(calls[0]?.options.tools).toEqual([]);
  expect(calls[0]?.options.allowedTools).toEqual([]);
  // Houston talking to the model about the chat is not a turn the user asked
  // for: not one frame of it may reach their transcript.
  expect(seen).toEqual([]);
});

test("custom instructions ride the summarization request", async () => {
  const { query, calls } = scripted(() => [textMsg("summary"), usageMsg(10)]);
  const session = make(query, store("sdk-1"));

  await session.compact("List the durable facts in a fenced block.");

  expect(calls[0]?.prompt).toContain(
    "List the durable facts in a fenced block.",
  );
});

test("the turn after a compaction opens a fresh session carrying the summary", async () => {
  const sessions = store("sdk-1");
  const { query, calls } = scripted((call) =>
    call.options.resume
      ? [textMsg("They are planning a trip to Lisbon."), usageMsg(400)]
      : [textMsg("ok"), usageMsg(30, "sdk-2")],
  );
  const session = make(query, sessions);

  await session.compact();
  await session.prompt("what month again?");

  const turn = calls[1];
  // No resume: the compacted session is gone. Without the summary in the
  // prompt the model would start the next turn remembering nothing at all.
  expect(turn?.options.resume).toBeUndefined();
  expect(turn?.prompt).toContain("Lisbon");
  expect(turn?.prompt).toContain("what month again?");
  // The prefix is consumed exactly once — a second turn must not re-send it.
  await session.prompt("and the flights?");
  expect(calls[2]?.prompt).not.toContain("Lisbon");
});

test("a refused summarization costs the user nothing", async () => {
  const sessions = store("sdk-1");
  const { query } = scripted(() => [errorMsg]);
  const session = make(query, sessions);

  await expect(session.compact()).rejects.toThrow(/Summarization failed/i);
  // The conversation still has every turn it had: the mapping survives.
  expect(sessions.id()).toBe("sdk-1");
});

test("an empty summary is a failure, never a silent context wipe", async () => {
  const sessions = store("sdk-1");
  const { query } = scripted(() => [textMsg("   "), usageMsg(10)]);
  const session = make(query, sessions);

  await expect(session.compact()).rejects.toThrow(/Summarization failed/i);
  expect(sessions.id()).toBe("sdk-1");
});

test("a conversation with no SDK session yet has nothing to compact", async () => {
  const { query, calls } = scripted(() => []);
  const session = make(query, store(undefined));

  // Matched by conversation-command-run.ts to log the ordinary "fresh chat"
  // case at info instead of warning about it.
  await expect(session.compact()).rejects.toThrow(/nothing to compact/i);
  expect(calls).toEqual([]);
});

test("the compacted context fill is unknown, so the next turn does not compact again", async () => {
  const sessions = store("sdk-1");
  const { query } = scripted((call) =>
    call.options.resume ? [textMsg("summary"), usageMsg(190_000)] : [],
  );
  const session = make(query, sessions);
  await session.prompt("fill the window");
  expect(session.getContextUsage()).toEqual({ tokens: 190_000 });

  await session.compact();

  // A stale fill here is what would make the autocompact check (exec-turn.ts)
  // compact on every following turn forever.
  expect(session.getContextUsage()).toBeUndefined();
});

test("a disposed session compacts nothing", async () => {
  const { query, calls } = scripted(() => [textMsg("summary"), usageMsg(10)]);
  const session = make(query, store("sdk-1"));
  session.dispose();

  await expect(session.compact()).resolves.toBeUndefined();
  expect(calls).toEqual([]);
});

test("Stop cancels a summarization that is still running", async () => {
  const sessions = store("sdk-1");
  let signalled: AbortSignal | undefined;
  const query: ClaudeQuery = (params) => {
    signalled = params.options.abortController?.signal;
    return (async function* () {
      await Promise.resolve();
      yield textMsg("summary");
      yield usageMsg(10);
    })();
  };
  const session = make(query, sessions);

  const compacting = session.compact();
  await Promise.resolve();
  await session.abort();
  await compacting.catch(() => undefined);

  expect(signalled?.aborted).toBe(true);
});
