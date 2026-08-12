import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import type { HarnessSession, ResolvedModel, ThinkingLevel } from "../types";
import { toSdkEffort } from "./effort";
import { classifyText } from "./errors";
import { toSdkModel } from "./model";
import type { SessionsStore } from "./sessions-store";
import { createStreamTranslator } from "./translate";

/**
 * The SDK `query` function, narrowed to what a session consumes: one call runs
 * one turn to completion, yielding SDK messages. Injected (not imported) so the
 * contract suite drives a scripted async generator with no binary or network.
 */
export type ClaudeQuery = (params: {
  prompt: string;
  options: Options;
}) => AsyncIterable<SDKMessage>;

/** Everything a `ClaudeSession` needs; assembled by the backend factory. */
export interface ClaudeSessionDeps {
  query: ClaudeQuery;
  conversationId: string;
  /** Static per-session options (cwd, env, tools, canUseTool, systemPrompt, …). */
  baseOptions: Options;
  sessionsStore: SessionsStore;
  /** Initial SDK model string. */
  model: string;
  thinkingLevel?: ThinkingLevel;
  /**
   * Digest of the OAuth access token in the subprocess env (the token every
   * turn on this session runs on) — what a revoked-token report names.
   * Undefined when the session runs on an api_key or the config-dir
   * credential, where the report must not fire (PRODUCT-1319).
   */
  usedAccessDigest?: string;
}

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
 * The Claude Agent SDK implementation of `HarnessSession`. `prompt` runs one
 * `query()` to completion, translating SDK messages into the pi wire dialect
 * (text/thinking/tool_start/tool_end/usage/provider_error) — never `done`, which
 * the orchestrator emits. It NEVER throws on a provider failure: a typed error
 * rides the stream as a `provider_error` frame instead. `abort` cancels via the
 * turn's `AbortController`; the SDK iterator then throws, and the post-abort
 * throw is swallowed (whatever its shape) so the stop is not double-reported.
 */
export class ClaudeSession implements HarnessSession {
  private readonly listeners = new Set<(e: WireEvent) => void>();
  private disposed = false;
  private aborting = false;
  private abortController: AbortController | undefined;
  private model: string;
  private thinkingLevel: ThinkingLevel | undefined;
  private contextTokens: number | undefined;

  constructor(private readonly deps: ClaudeSessionDeps) {
    this.model = deps.model;
    this.thinkingLevel = deps.thinkingLevel;
  }

  subscribe(listener: (e: WireEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: WireEvent): void {
    for (const l of this.listeners) l(e);
  }

  async prompt(text: string): Promise<void> {
    if (this.disposed) return;
    const resume = this.deps.sessionsStore.resolveResume(
      this.deps.conversationId,
    );
    const outcome = await this.runAttempt(text, resume);
    if (outcome !== "retry-fresh") return;
    // The SDK refused the resume id (its cwd-scoped lookup missed the
    // transcript — e.g. the workspace was renamed). The stale mapping is
    // already dropped; run the turn once more as a fresh session instead of
    // erroring a conversation that can never resume again.
    console.warn(
      `[claude] resume for conversation ${this.deps.conversationId} was rejected by the SDK; starting a fresh session`,
    );
    await this.runAttempt(text, undefined);
  }

  /**
   * One `query()` to completion. Returns "retry-fresh" ONLY when a resume was
   * attempted and the SDK rejected the session id as unknown — the caller then
   * reruns without resume; every wire event of the failed attempt is
   * suppressed, so the user sees one clean turn, not an error + a retry. Any
   * other outcome (success, abort, real provider failure) returns "done".
   */
  private async runAttempt(
    text: string,
    resume: string | undefined,
  ): Promise<"done" | "retry-fresh"> {
    this.aborting = false;
    const abortController = new AbortController();
    this.abortController = abortController;

    const effort = this.thinkingLevel
      ? toSdkEffort(this.thinkingLevel)
      : undefined;
    const options: Options = {
      ...this.deps.baseOptions,
      model: this.model,
      abortController,
      ...(resume ? { resume } : {}),
      ...(effort ? { thinking: effort.thinking, effort: effort.effort } : {}),
    };

    const translator = createStreamTranslator({
      onContextTokens: (t) => {
        this.contextTokens = t;
      },
      usedAccessDigest: this.deps.usedAccessDigest,
    });
    let capturedSessionId: string | undefined;
    // True once this turn has surfaced a provider_error (from `translate`), so a
    // throw-AFTER-error-result — the SDK routinely rejects the iterator right
    // after yielding an error `result` — is not reported a SECOND time.
    let providerErrored = false;
    const danglingResume = (message: string): boolean =>
      resume !== undefined && DANGLING_RESUME_RE.test(message);
    try {
      for await (const msg of this.deps.query({ prompt: text, options })) {
        if (this.aborting) break;
        if (hasSessionId(msg)) capturedSessionId = msg.session_id;
        for (const wire of translator.translate(msg)) {
          if (wire.type === "provider_error") {
            const errText =
              wire.data.kind === "unknown"
                ? wire.data.raw_excerpt
                : wire.data.message;
            if (danglingResume(errText)) {
              this.deps.sessionsStore.remove(this.deps.conversationId);
              return "retry-fresh";
            }
            providerErrored = true;
          }
          this.emit(wire);
        }
      }
    } catch (err) {
      // The user's Stop aborts the controller, which makes the SDK iterator
      // throw (any shape). Swallow it — cancelTurn already surfaced the stop, so
      // a second terminal here would double-report it. We gate on our OWN abort
      // state (not `instanceof AbortError`) deliberately: importing the SDK's
      // error class at module load would eager-load the 250 MB optional binary
      // into every non-Anthropic process.
      if (this.aborting) return "done";
      // The typed failure already rode the stream as a provider_error; the trailing
      // throw is just the SDK closing the iterator — don't re-report it.
      if (providerErrored) return "done";
      if (danglingResume(errMessage(err))) {
        this.deps.sessionsStore.remove(this.deps.conversationId);
        return "retry-fresh";
      }
      // Any other throw is an unexpected transport failure: surface it as a
      // typed provider_error rather than rethrow, so the turn never dies silently.
      this.emit({
        type: "provider_error",
        data: classifyText(
          errMessage(err),
          this.model,
          null,
          this.deps.usedAccessDigest,
        ),
      });
    } finally {
      if (capturedSessionId)
        this.deps.sessionsStore.setSessionId(
          this.deps.conversationId,
          capturedSessionId,
        );
    }
    return "done";
  }

  async abort(): Promise<void> {
    this.aborting = true;
    this.abortController?.abort();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController?.abort();
    this.listeners.clear();
  }

  async setModel(model: ResolvedModel): Promise<void> {
    this.model = toSdkModel(model.id);
  }

  async compact(): Promise<void> {
    // No-op: the SDK auto-compacts; context tokens update from compact_boundary.
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.thinkingLevel = level;
  }

  getContextUsage(): { tokens: number | null } | undefined {
    return this.contextTokens === undefined
      ? undefined
      : { tokens: this.contextTokens };
  }
}

function hasSessionId(
  msg: SDKMessage,
): msg is SDKMessage & { session_id: string } {
  return (
    "session_id" in msg &&
    typeof (msg as { session_id?: unknown }).session_id === "string"
  );
}
