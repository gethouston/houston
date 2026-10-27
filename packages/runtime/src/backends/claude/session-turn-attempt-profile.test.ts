import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, expect, test, vi } from "vitest";
import {
  armClaudeStartupProfile,
  takeClaudeStartupProfile,
} from "../../turn/turn-claude-startup";
import type { ClaudeQuery } from "./session-deps";
import { runTurnAttempt } from "./session-turn-attempt";
import type { TurnAttemptState } from "./session-turn-attempt-state";
import type { SessionsStore } from "./sessions-store";

const REPORT = {
  metadata: { init_network_ms: 40 },
  marks: [{ name: "init_network_configured", startTime: 283 }],
};

const msg = (value: object) => value as unknown as SDKMessage;
const INIT = msg({
  type: "system",
  subtype: "init",
  session_id: "s1",
  mcp_servers: [{ name: "houston", status: "connected" }],
});
const RESULT = msg({
  type: "result",
  subtype: "success",
  usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0 },
  session_id: "s1",
});

const locked: string[] = [];
afterEach(() => {
  for (const dir of locked.splice(0)) chmodSync(dir, 0o755);
  takeClaudeStartupProfile();
  vi.restoreAllMocks();
});

/** A query that writes the CLI's startup report, as a profiled CLI does. */
function profilingQuery(seen: Options[]): ClaudeQuery {
  return async function* ({ options }) {
    seen.push(options);
    const configDir = options.env?.CLAUDE_CONFIG_DIR;
    if (configDir && options.env?.CLAUDE_CODE_PROFILE_STARTUP === "1") {
      mkdirSync(join(configDir, "startup-perf"), { recursive: true });
      writeFileSync(
        join(configDir, "startup-perf", "s1.json"),
        JSON.stringify(REPORT),
      );
    }
    yield INIT;
    yield RESULT;
  };
}

function attemptState(query: ClaudeQuery, aborting = () => false) {
  const configDir = mkdtempSync(join(tmpdir(), "claude-attempt-"));
  const saved: string[] = [];
  const store = {
    setSessionId: (_c: string, id: string) => saved.push(id),
    remove: () => {},
  } as unknown as SessionsStore;
  const state: TurnAttemptState = {
    deps: {
      query,
      conversationId: "c1",
      baseOptions: {} as Options,
      sessionsStore: store,
      model: "claude-sonnet-4-6",
      refreshAuth: () => ({ env: { CLAUDE_CONFIG_DIR: configDir } }),
    },
    model: "claude-sonnet-4-6",
    thinkingLevel: undefined,
    beginAttempt: () => {},
    isAborting: aborting,
    setContextTokens: () => {},
    setUsedAccessDigest: () => {},
    setRetryReason: () => {},
    emit: () => {},
    tickLiveness: () => {},
    emitAssistantMessageStart: () => {},
    emitReplyBeat: () => {},
    emitTiming: () => {},
  };
  return { state, configDir, saved };
}

const input = { text: "hola", resume: undefined, promptTokens: 10 };

test("a sampled attempt runs the CLI profiled and collects its own config dir", async () => {
  armClaudeStartupProfile(true, () => 0);
  const seen: Options[] = [];
  const { state, configDir, saved } = attemptState(profilingQuery(seen));

  expect(await runTurnAttempt(state, input)).toBe("success");
  expect(seen[0]?.env?.CLAUDE_CODE_PROFILE_STARTUP).toBe("1");
  expect(saved).toEqual(["s1"]);
  expect(existsSync(join(configDir, "startup-perf"))).toBe(false);
  expect(takeClaudeStartupProfile()).toEqual({
    "phase.init_network": 40,
    init_network_configured: 283,
  });
});

test("an unsampled attempt's CLI runs without the profiler", async () => {
  armClaudeStartupProfile(true, () => 0.9);
  const seen: Options[] = [];
  const { state } = attemptState(profilingQuery(seen));

  expect(await runTurnAttempt(state, input)).toBe("success");
  expect(seen[0]?.env).not.toHaveProperty("CLAUDE_CODE_PROFILE_STARTUP");
});

test("an attempt that exits early leaves the CLI's report alone", async () => {
  armClaudeStartupProfile(true, () => 0);
  let stopped = false;
  const query: ClaudeQuery = async function* (params) {
    yield* profilingQuery([])(params);
    stopped = true;
  };
  const { state, configDir } = attemptState(query, () => stopped);

  await runTurnAttempt(state, input);
  expect(existsSync(join(configDir, "startup-perf", "s1.json"))).toBe(true);
  expect(takeClaudeStartupProfile()).toBeUndefined();
});

test("a folder that cannot be removed is reported and never fails the turn", async () => {
  armClaudeStartupProfile(true, () => 0);
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  const { state, configDir, saved } = attemptState(profilingQuery([]));
  const writable = state.deps.refreshAuth;
  state.deps.refreshAuth = () => {
    const auth = writable();
    // The report lands, then the config dir turns read-only before cleanup.
    mkdirSync(join(configDir, "startup-perf"));
    writeFileSync(
      join(configDir, "startup-perf", "s1.json"),
      JSON.stringify(REPORT),
    );
    chmodSync(configDir, 0o555);
    locked.push(configDir);
    return auth;
  };
  state.deps.query = async function* () {
    yield INIT;
    yield RESULT;
  };

  expect(await runTurnAttempt(state, input)).toBe("success");
  expect(saved).toEqual(["s1"]);
  expect(reported).toHaveBeenCalledWith(
    "[claude] startup profile collection failed:",
    expect.objectContaining({ code: "EACCES" }),
  );
  expect(takeClaudeStartupProfile()).toMatchObject({
    init_network_configured: 283,
  });
});
