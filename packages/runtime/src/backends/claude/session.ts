import type { WireEvent } from "@houston/runtime-client";
import {
  type CompactionCheckpoints,
  conversationCompactions,
} from "../../store/conversation-compaction";
import type {
  CompactionOutcome,
  HarnessSession,
  ResolvedModel,
  ThinkingLevel,
} from "../types";
import { compactClaudeSession, compactedPreamble } from "./compact";
import { toSdkModel } from "./model";
import type { ClaudeSessionDeps } from "./session-deps";
import { SessionEventHub } from "./session-events";
import { runTurnAttempt, type TurnAttemptState } from "./session-turn-attempt";

export type { ClaudeQuery, ClaudeSessionDeps, TurnAuth } from "./session-deps";

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
  private readonly events = new SessionEventHub();
  private disposed = false;
  private aborting = false;
  /** Why the last attempt asked for a fresh rerun, for the warn line. */
  private retryReason = "";
  private abortController: AbortController | undefined;
  private model: string;
  private thinkingLevel: ThinkingLevel | undefined;
  private contextTokens: number | undefined;
  private usedAccessDigest: string | undefined;
  private readonly compactions: CompactionCheckpoints;

  constructor(private readonly deps: ClaudeSessionDeps) {
    this.compactions = deps.compactions ?? conversationCompactions;
    this.model = deps.model;
    this.thinkingLevel = deps.thinkingLevel;
    this.usedAccessDigest = deps.usedAccessDigest;
  }

  /**
   * The digest of the OAuth access token this session's next spawn runs on
   * (build-time until the first prompt, then each prompt's `refreshAuth` read).
   * The conversation cache compares it against the CURRENTLY stored credential
   * to rebuild sessions left on a rotated-out token (PRODUCT-1355 layer 2).
   */
  getUsedAccessDigest(): string | undefined {
    return this.usedAccessDigest;
  }

  subscribe(listener: (e: WireEvent) => void): () => void {
    return this.events.subscribe(listener);
  }

  subscribeLiveness(listener: () => void): () => void {
    return this.events.subscribeLiveness(listener);
  }

  /**
   * The Messages API `message_start` stream event of the main thread: one
   * model round-trip beginning (a subagent's stream carries a parent tool id
   * and is not this conversation's message).
   */
  subscribeAssistantMessageStart(listener: () => void): () => void {
    return this.events.subscribeAssistantMessageStart(listener);
  }

  async prompt(text: string): Promise<void> {
    if (this.disposed) return;
    // Fresh credential per turn (PRODUCT-1355): every `query()` spawns its own
    // SDK subprocess, so re-reading here means this turn runs on the token the
    // store holds NOW — a reconnect or the gateway's rotation lands on the very
    // next turn instead of never. The digest follows the env so a revoked-token
    // report names the token this turn actually ran on (PRODUCT-1319).
    const auth = this.deps.refreshAuth();
    this.usedAccessDigest = auth.accessDigest;
    const checkpoint = this.compactions.read(this.deps.conversationId);
    const resume = checkpoint
      ? undefined
      : this.deps.sessionsStore.resolveResume(this.deps.conversationId);
    const prompt = `${checkpoint ? compactedPreamble(checkpoint.summary) : ""}${text}`;
    let outcome = await runTurnAttempt(this.attemptState(), {
      text: prompt,
      resume,
      env: auth.env,
    });
    if (outcome === "retry-fresh") {
      // The SDK refused the resume id (its cwd-scoped lookup missed the
      // transcript — e.g. the workspace was renamed), or resumed it with
      // Houston's tool server detached (PRODUCT-1706). The stale mapping is
      // already dropped; run the turn once more as a fresh session instead of
      // erroring a conversation that can never resume again.
      console.warn(
        `[claude] resume for conversation ${this.deps.conversationId} ${this.retryReason}; starting a fresh session`,
      );
      outcome = await runTurnAttempt(this.attemptState(), {
        text: `${this.deps.freshRetryPromptPrefix ?? ""}${prompt}`,
        resume: undefined,
        env: auth.env,
      });
    }
    if (outcome === "success" && checkpoint)
      this.compactions.consume(this.deps.conversationId, checkpoint);
  }

  /** This session's mutable state as one attempt is allowed to see it. */
  private attemptState(): TurnAttemptState {
    return {
      deps: this.deps,
      model: this.model,
      thinkingLevel: this.thinkingLevel,
      usedAccessDigest: this.usedAccessDigest,
      beginAttempt: (controller) => {
        this.aborting = false;
        this.abortController = controller;
      },
      isAborting: () => this.aborting,
      setContextTokens: (tokens) => {
        this.contextTokens = tokens;
      },
      setRetryReason: (reason) => {
        this.retryReason = reason;
      },
      emit: (e) => this.events.emit(e),
      tickLiveness: () => this.events.tickLiveness(),
      emitAssistantMessageStart: () => this.events.emitAssistantMessageStart(),
    };
  }

  async abort(): Promise<void> {
    this.aborting = true;
    this.abortController?.abort();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController?.abort();
    this.events.clearListeners();
  }

  async setModel(model: ResolvedModel): Promise<void> {
    this.model = toSdkModel(model.id);
  }

  /**
   * Summarize this conversation and restart its SDK session on the summary
   * (`./compact`). Rejects rather than reporting a compaction that did not
   * happen — the caller turns that into the turn's error — and leaves the
   * session untouched when it does, so a failed compaction never costs history.
   *
   * `customInstructions` ride the summarization request, which is what lets the
   * assistant's compaction ask for the durable facts the summarized stretch
   * revealed (session/durable-facts.ts) on this backend exactly as on pi.
   */
  async compact(
    customInstructions?: string,
  ): Promise<CompactionOutcome | undefined> {
    if (this.disposed) return undefined;
    const auth = this.deps.refreshAuth();
    this.usedAccessDigest = auth.accessDigest;
    // Registered as the session's controller so the user's Stop (and dispose)
    // cancels a summarization that is still running.
    const abortController = new AbortController();
    this.abortController = abortController;
    const outcome = await compactClaudeSession(
      {
        query: this.deps.query,
        conversationId: this.deps.conversationId,
        baseOptions: this.deps.baseOptions,
        sessionsStore: this.deps.sessionsStore,
        compactions: this.compactions,
        model: this.model,
        env: auth.env,
        abortController,
      },
      customInstructions,
    );
    // The window now holds a summary, not the history: reporting the old fill
    // would make the autocompact check compact again on every following turn
    // (exec-turn.ts). Unknown until the next turn's usage frame — which is the
    // honest answer, and the one a fresh session starts from.
    this.contextTokens = undefined;
    return outcome;
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
