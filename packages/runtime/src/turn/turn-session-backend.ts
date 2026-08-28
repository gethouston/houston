import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { readAuthFile } from "../auth/auth-file";
import type { newUsedTokenCapture } from "../auth/used-token";
import {
  renderReplayPreamble,
  replayCharBudget,
} from "../session/replay-transcript";
import { resolveTurnClaudeResume } from "./turn-backend";
import { readTurnHarness, writeTurnHarness } from "./turn-harness-state";
import {
  finishTurnSessionStartup,
  type RunTurnDeps,
  startTurnSession,
} from "./turn-session-startup";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session-types";

/** Finish overlapped setup and open a backend session from hydrated state. */
export async function openTurnBackendSession(input: {
  directories: TurnDirectories;
  turn: TurnSessionRequest;
  deps: RunTurnDeps;
  canonicalMessages: ChatMessage[];
  usedTokens: ReturnType<typeof newUsedTokenCapture>;
}) {
  const { turn, directories } = input;
  const { provider, pin, conversationId, turnId } = turn;
  const { backend, model } = await finishTurnSessionStartup(
    turn.startup ?? startTurnSession(directories, turn, input.deps),
  );
  const turnCred = readAuthFile(join(directories.dataDir, "auth.json"))[
    provider
  ];
  if (turnCred?.type === "oauth" && turnCred.access)
    input.usedTokens.record(provider, turnCred.access);
  const diagnostic = model as unknown as {
    id?: string;
    baseUrl?: string;
    reasoning?: boolean;
  };
  console.log(
    `[turn] provider=${provider} model=${diagnostic.id} baseUrl=${diagnostic.baseUrl}`,
  );
  const effort =
    pin?.effort ??
    (diagnostic.reasoning === true ? DEFAULT_REASONING_EFFORT : undefined);
  const thinkingLevel = toThinkingLevel(effort);
  const harness = backend.id === "anthropic" ? "claude" : "pi";
  const priorHarness = readTurnHarness(directories.dataDir, conversationId);
  const switchedHarness =
    priorHarness !== undefined && priorHarness !== harness;
  writeTurnHarness(directories.dataDir, conversationId, harness);
  const claudeResume =
    harness === "claude" && !switchedHarness
      ? resolveTurnClaudeResume(directories, conversationId)
      : undefined;
  const replay =
    input.canonicalMessages.length > 0 &&
    (switchedHarness || (harness === "claude" && !claudeResume))
      ? renderReplayPreamble(
          input.canonicalMessages,
          turnId,
          replayCharBudget(model.contextWindow),
        )
      : null;
  const retryReplay =
    harness === "claude" && input.canonicalMessages.length > 0
      ? (replay ??
        renderReplayPreamble(
          input.canonicalMessages,
          turnId,
          replayCharBudget(model.contextWindow),
        ))
      : null;
  const session = await backend.createSession({
    conversationId,
    model,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(turn.context ? { context: turn.context } : {}),
    ...(turn.mode ? { mode: turn.mode } : {}),
    ...(switchedHarness ? { fresh: true } : {}),
    ...(retryReplay?.text ? { freshRetryPromptPrefix: retryReplay.text } : {}),
  });
  if (turn.timings) turn.timings.t_backend_session = performance.now();
  return { replay, session };
}
