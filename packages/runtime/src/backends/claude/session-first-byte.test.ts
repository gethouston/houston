import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { buildClaudeEnv } from "./claude-env";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

/**
 * The CLI's request timeout (`API_TIMEOUT_MS`) is the first-byte deadline,
 * and Anthropic reads the whole prompt before its first byte. One value
 * covers every request of the turn, so it is sized for the conversation the
 * turn resumes, its prompt, and the turn's own growth.
 */

function store(resume: string | undefined): SessionsStore {
  return {
    getSessionId: () => resume,
    setSessionId: () => {},
    remove: () => {},
    purge: () => {},
    resolveResume: () => resume,
  };
}

function session(input: {
  resume: string | undefined;
  recorded?: number;
  usage?: number;
}) {
  const timeouts: (string | undefined)[] = [];
  const query: ClaudeQuery = async function* (params: {
    options: Options;
  }): AsyncIterable<SDKMessage> {
    timeouts.push(params.options.env?.API_TIMEOUT_MS);
    if (input.usage === undefined) return;
    yield {
      type: "result",
      subtype: "success",
      usage: { input_tokens: input.usage, output_tokens: 0 },
      session_id: "s",
    } as unknown as SDKMessage;
  };
  const claude = new ClaudeSession({
    query,
    conversationId: "c1",
    baseOptions: {} as Options,
    sessionsStore: store(input.resume),
    model: "claude-sonnet-4-6",
    refreshAuth: (promptTokens) => ({
      env: buildClaudeEnv(undefined, { configDir: "/config", promptTokens }),
    }),
    ...(input.recorded === undefined
      ? {}
      : { recordedContextTokens: () => input.recorded }),
  });
  return { claude, timeouts };
}

test("the env's timeout without a known size is the small-prompt deadline", () => {
  expect(
    buildClaudeEnv(undefined, { configDir: "/config" }).API_TIMEOUT_MS,
  ).toBe("15000");
  expect(
    buildClaudeEnv(undefined, { configDir: "/config", promptTokens: 800_000 })
      .API_TIMEOUT_MS,
  ).toBe("55000");
});

test("a turn resuming an 800k-token conversation waits for Anthropic to read it", async () => {
  const { claude, timeouts } = session({
    resume: "sess-1",
    recorded: 800_000,
  });
  await claude.prompt("go");
  // 800k recorded, the prompt, and 100k of growth during the turn.
  expect(timeouts).toEqual(["60000"]);
});

test("a fresh session sends only its prompt, whatever the conversation recorded", async () => {
  const { claude, timeouts } = session({
    resume: undefined,
    recorded: 800_000,
  });
  await claude.prompt("go");
  expect(timeouts).toEqual(["20000"]);
});

test("a later turn sizes from the fill the last request measured", async () => {
  const { claude, timeouts } = session({
    resume: "sess-1",
    recorded: 800_000,
    usage: 100,
  });
  await claude.prompt("go");
  await claude.prompt("go");
  expect(timeouts).toEqual(["60000", "20005"]);
});
