import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import type { ThinkingLevel } from "../types";
import { toSdkEffort } from "./effort";
import { classifyText } from "./errors";
import { hasSessionId, isAssistantMessageStart } from "./sdk-message-shapes";
import type { ClaudeSessionDeps, TurnAuth } from "./session-deps";
import { houstonToolServerLost } from "./tool-server-lost";
import { createStreamTranslator } from "./translate";

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
 * The exact slice of `ClaudeSession` one attempt reads and writes, handed over
 * explicitly so the attempt owns no hidden view of the session's fields. The
 * session rebuilds it per attempt, so the values are the ones in force NOW.
 */
export interface TurnAttemptState {
  readonly deps: ClaudeSessionDeps;
  /** The SDK model string this attempt spawns with. */
  readonly model: string;
  readonly thinkingLevel: ThinkingLevel | undefined;
  /** Digest of the OAuth access token this attempt runs on, for error reports. */
  readonly usedAccessDigest: string | undefined;
  /**
   * Clear the session's abort flag and register this attempt's controller, so
   * the user's Stop (and dispose) cancels the query that is about to run.
   */
  beginAttempt(controller: AbortController): void;
  /** Whether the user's Stop already fired for this attempt. */
  isAborting(): boolean;
  setContextTokens(tokens: number): void;
  /** Why this attempt asked for a fresh rerun, for the session's warn line. */
  setRetryReason(reason: string): void;
  emit(e: WireEvent): void;
  tickLiveness(): void;
  /** One model round-trip beginning, for the turn's finish marks. */
  emitAssistantMessageStart(): void;
}

/** The per-attempt inputs: the prompt, the resume id to try, the turn's env. */
export interface TurnAttemptInput {
  text: string;
  resume: string | undefined;
  env: TurnAuth["env"];
}

/**
 * One `query()` to completion. Returns "retry-fresh" ONLY when a resume was
 * attempted and the SDK rejected the session id as unknown — the caller then
 * reruns without resume; every wire event of the failed attempt is
 * suppressed, so the user sees one clean turn, not an error + a retry. Any
 * other outcome (success, abort, real provider failure) returns "done".
 */
export async function runTurnAttempt(
  state: TurnAttemptState,
  { text, resume, env }: TurnAttemptInput,
): Promise<"success" | "failed" | "retry-fresh"> {
  const abortController = new AbortController();
  state.beginAttempt(abortController);

  const effort = state.thinkingLevel
    ? toSdkEffort(state.thinkingLevel)
    : undefined;
  const options: Options = {
    ...state.deps.baseOptions,
    // The per-turn env OVERRIDES the build-time one in baseOptions, so this
    // spawn carries the currently stored credential (PRODUCT-1355).
    env,
    model: state.model,
    abortController,
    ...(resume ? { resume } : {}),
    ...(effort ? { thinking: effort.thinking, effort: effort.effort } : {}),
  };

  const translator = createStreamTranslator({
    onContextTokens: (t) => {
      state.setContextTokens(t);
    },
    usedAccessDigest: state.usedAccessDigest,
  });
  let capturedSessionId: string | undefined;
  // True once this turn has surfaced a provider_error (from `translate`), so a
  // throw-AFTER-error-result — the SDK routinely rejects the iterator right
  // after yielding an error `result` — is not reported a SECOND time.
  let providerErrored = false;
  let succeeded = false;
  const danglingResume = (message: string): boolean =>
    resume !== undefined && DANGLING_RESUME_RE.test(message);
  try {
    for await (const msg of state.deps.query({ prompt: text, options })) {
      if (state.isAborting()) break;
      state.tickLiveness();
      if (msg.type === "result" && msg.subtype === "success") succeeded = true;
      if (isAssistantMessageStart(msg)) state.emitAssistantMessageStart();
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
            state.usedAccessDigest,
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
    }
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
      data: classifyText(
        errMessage(err),
        state.model,
        null,
        state.usedAccessDigest,
      ),
    });
  } finally {
    if (capturedSessionId)
      state.deps.sessionsStore.setSessionId(
        state.deps.conversationId,
        capturedSessionId,
      );
  }
  return succeeded && !providerErrored && !abortController.signal.aborted
    ? "success"
    : "failed";
}
