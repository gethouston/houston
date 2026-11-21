import type { Options } from "@anthropic-ai/claude-agent-sdk";
import {
  claudeStartupProfileEnv,
  collectClaudeStartupProfile,
} from "../../turn/turn-claude-startup";
import { markTurnOnce } from "../../turn/turn-network-marks";
import { toSdkEffort } from "./effort";
import { classifyText } from "./errors";
import { createClaudeCallTimer } from "./model-calls";
import {
  hasSessionId,
  isAssistantMessageStart,
  replyBeatOf,
} from "./sdk-message-shapes";
import type {
  TurnAttemptInput,
  TurnAttemptState,
} from "./session-turn-attempt-state";
import { houstonToolServerLost } from "./tool-server-lost";
import { createStreamTranslator } from "./translate";

export type {
  TurnAttemptInput,
  TurnAttemptState,
} from "./session-turn-attempt-state";

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const DANGLING_RESUME_RE = /No conversation found with session ID/i;

export async function runTurnAttempt(
  state: TurnAttemptState,
  { text, resume, promptTokens }: TurnAttemptInput,
): Promise<"success" | "failed" | "retry-fresh"> {
  const { env, accessDigest } = state.deps.refreshAuth(promptTokens);
  state.setUsedAccessDigest(accessDigest);
  const abortController = new AbortController();
  state.beginAttempt(abortController);

  const effort = state.thinkingLevel
    ? toSdkEffort(state.thinkingLevel)
    : undefined;
  const options: Options = {
    ...state.deps.baseOptions,
    env: { ...env, ...claudeStartupProfileEnv() },
    model: state.model,
    abortController,
    ...(resume ? { resume } : {}),
    ...(effort ? { thinking: effort.thinking, effort: effort.effort } : {}),
  };

  const translator = createStreamTranslator({
    onContextTokens: (t) => {
      state.setContextTokens(t);
    },
    usedAccessDigest: accessDigest,
  });
  let capturedSessionId: string | undefined;
  let providerErrored = false;
  let succeeded = false;
  let streamEnded = false;
  const danglingResume = (message: string): boolean =>
    resume !== undefined && DANGLING_RESUME_RE.test(message);
  const timer = createClaudeCallTimer();
  try {
    for await (const msg of state.deps.query({ prompt: text, options })) {
      if (state.isAborting()) break;
      state.tickLiveness();
      for (const timing of timer(msg)) state.emitTiming(timing);
      if (msg.type === "system" && msg.subtype === "init")
        markTurnOnce("t_claude_init");
      else markTurnOnce("t_claude_first_message");
      if (msg.type === "result" && msg.subtype === "success") succeeded = true;
      if (isAssistantMessageStart(msg)) state.emitAssistantMessageStart();
      const beat = replyBeatOf(msg);
      if (hasSessionId(msg)) capturedSessionId = msg.session_id;
      if (houstonToolServerLost(msg, state.deps.baseOptions.allowedTools)) {
        abortController.abort();
        if (resume !== undefined) {
          capturedSessionId = undefined;
          state.setRetryReason("came up without Houston's tool server");
          state.deps.sessionsStore.remove(state.deps.conversationId);
          return "retry-fresh";
        }
        state.emit({
          type: "provider_error",
          data: classifyText(
            "Houston's tools did not attach to this turn (the houston MCP server is not connected); the turn was stopped instead of running without them",
            state.model,
            null,
            accessDigest,
          ),
        });
        return "failed";
      }
      for (const wire of translator.translate(msg)) {
        if (wire.type === "provider_error") {
          const errText =
            wire.data.kind === "unknown"
              ? wire.data.raw_excerpt
              : wire.data.message;
          if (danglingResume(errText)) {
            state.setRetryReason("was rejected by the SDK");
            state.deps.sessionsStore.remove(state.deps.conversationId);
            return "retry-fresh";
          }
          providerErrored = true;
        }
        state.emit(wire);
      }
      if (beat) state.emitReplyBeat(beat);
    }
    streamEnded = !state.isAborting();
  } catch (err) {
    if (state.isAborting()) return "failed";
    if (providerErrored) return "failed";
    if (danglingResume(errMessage(err))) {
      state.setRetryReason("was rejected by the SDK");
      state.deps.sessionsStore.remove(state.deps.conversationId);
      return "retry-fresh";
    }
    providerErrored = true;
    state.emit({
      type: "provider_error",
      data: classifyText(errMessage(err), state.model, null, accessDigest),
    });
  } finally {
    if (capturedSessionId)
      state.deps.sessionsStore.setSessionId(
        state.deps.conversationId,
        capturedSessionId,
      );
    if (streamEnded) collectClaudeStartupProfile(env.CLAUDE_CONFIG_DIR);
  }
  return succeeded && !providerErrored && !abortController.signal.aborted
    ? "success"
    : "failed";
}
