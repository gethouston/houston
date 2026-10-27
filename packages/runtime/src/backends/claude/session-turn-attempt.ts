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

/**
 * The SDK's rejection of a `resume` id it cannot find. `resolveResume` already
 * drops mappings whose transcript file is gone, but the SDK scopes its lookup
 * to the CURRENT cwd's project slug — after an agent rename moves the
 * workspace directory, the transcript still exists (old slug) yet every resume
 * fails with this error, permanently wedging the conversation (HOU-892 side
 * finding: a weekly routine erroring on every fire after its agent was
 * renamed). Matched on the message because the SDK surfaces it both as a
 * thrown error and as an error result.
 */
const DANGLING_RESUME_RE = /No conversation found with session ID/i;

/**
 * One `query()` to completion. Returns "retry-fresh" ONLY when a resume was
 * attempted and the SDK rejected the session id as unknown — the caller then
 * reruns without resume; every wire event of the failed attempt is
 * suppressed, so the user sees one clean turn, not an error + a retry. Any
 * other outcome (success, abort, real provider failure) returns "done".
 */
export async function runTurnAttempt(
  state: TurnAttemptState,
  { text, resume, promptTokens }: TurnAttemptInput,
): Promise<"success" | "failed" | "retry-fresh"> {
  // Fresh credential per attempt (PRODUCT-1355): every `query()` spawns its own
  // SDK subprocess, so re-reading here means this attempt runs on the token the
  // store holds NOW — a reconnect or the gateway's rotation lands on the very
  // next turn instead of never. The digest follows the env so a revoked-token
  // report names the token this attempt actually ran on (PRODUCT-1319).
  const { env, accessDigest } = state.deps.refreshAuth(promptTokens);
  state.setUsedAccessDigest(accessDigest);
  const abortController = new AbortController();
  state.beginAttempt(abortController);

  const effort = state.thinkingLevel
    ? toSdkEffort(state.thinkingLevel)
    : undefined;
  const options: Options = {
    ...state.deps.baseOptions,
    // The per-turn env OVERRIDES the build-time one in baseOptions, so this
    // spawn carries the currently stored credential (PRODUCT-1355).
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
  // True once this turn has surfaced a provider_error (from `translate`), so a
  // throw-AFTER-error-result — the SDK routinely rejects the iterator right
  // after yielding an error `result` — is not reported a SECOND time.
  let providerErrored = false;
  let succeeded = false;
  // The CLI exited on its own, so its startup report is complete on disk.
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
      if (houstonToolServerLost(msg)) {
        // The turn is running without Houston's tools (PRODUCT-1706). On a
        // resume, abandon this attempt and rerun fresh with the canonical
        // history — never let the model finish a tool-less turn and report
        // the integrations as "missing". A fresh session that still lacks
        // them is a real failure: surface it as one.
        abortController.abort();
        if (resume !== undefined) {
          // The mapping is dropped on purpose; the finally block must not
          // re-store the session id this attempt captured.
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
      if (beat) state.emitReplyBeat(beat); // after the frames it follows
    }
    streamEnded = !state.isAborting();
  } catch (err) {
    // The user's Stop aborts the controller, which makes the SDK iterator
    // throw (any shape). Swallow it — cancelTurn already surfaced the stop, so
    // a second terminal here would double-report it. We gate on our OWN abort
    // state (not `instanceof AbortError`) deliberately: importing the SDK's
    // error class at module load would eager-load the 250 MB optional binary
    // into every non-Anthropic process.
    if (state.isAborting()) return "failed";
    // The typed failure already rode the stream as a provider_error; the trailing
    // throw is just the SDK closing the iterator — don't re-report it.
    if (providerErrored) return "failed";
    if (danglingResume(errMessage(err))) {
      state.setRetryReason("was rejected by the SDK");
      state.deps.sessionsStore.remove(state.deps.conversationId);
      return "retry-fresh";
    }
    // Any other throw is an unexpected transport failure: surface it as a
    // typed provider_error rather than rethrow, so the turn never dies silently.
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
