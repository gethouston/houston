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
import { toSdkEffort } from "./effort";
import { toSdkModel } from "./model";
import type { ClaudeSessionDeps } from "./session-deps";
import { SessionEventSubscriptions } from "./session-events";
import { runSessionTurn } from "./session-prompt";
import type { TurnAttemptState } from "./session-turn-attempt";

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
export class ClaudeSession
  extends SessionEventSubscriptions
  implements HarnessSession
{
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
    super();
    this.compactions = deps.compactions ?? conversationCompactions;
    this.model = deps.model;
    this.thinkingLevel = deps.thinkingLevel;
    this.usedAccessDigest = deps.usedAccessDigest;
  }

  /**
   * The digest of the OAuth access token this session's next spawn runs on
   * (build-time until the first prompt, then each attempt's `refreshAuth` read).
   * The conversation cache compares it against the CURRENTLY stored credential
   * to rebuild sessions left on a rotated-out token (PRODUCT-1355 layer 2).
   */
  getUsedAccessDigest(): string | undefined {
    return this.usedAccessDigest;
  }

  async prompt(text: string): Promise<void> {
    if (this.disposed) return;
    const checkpoint = this.compactions.read(this.deps.conversationId);
    const resume = checkpoint
      ? undefined
      : this.deps.sessionsStore.resolveResume(this.deps.conversationId)
          ?.sessionId;
    const prompt = `${checkpoint ? compactedPreamble(checkpoint.summary) : ""}${text}`;
    const outcome = await runSessionTurn(() => this.attemptState(), {
      text: prompt,
      resume,
      fill: resume === undefined ? undefined : this.knownFill(),
      conversationId: this.deps.conversationId,
      freshPrefix: () => this.deps.freshRetryPromptPrefix?.() ?? "",
      retryReason: () => this.retryReason,
      stopped: () => this.disposed || this.aborting,
    });
    if (outcome === "success" && checkpoint)
      this.compactions.consume(this.deps.conversationId, checkpoint);
  }

  /** This session's mutable state as one attempt is allowed to see it. */
  private attemptState(): TurnAttemptState {
    return {
      deps: this.deps,
      model: this.model,
      thinkingLevel: this.thinkingLevel,
      beginAttempt: (controller) => {
        this.aborting = false;
        this.abortController = controller;
      },
      isAborting: () => this.aborting,
      setContextTokens: (tokens) => {
        this.contextTokens = tokens;
      },
      setUsedAccessDigest: (digest) => {
        this.usedAccessDigest = digest;
      },
      setRetryReason: (reason) => {
        this.retryReason = reason;
      },
      emit: (e) => this.events.emit(e),
      tickLiveness: () => this.events.tickLiveness(),
      emitAssistantMessageStart: () => this.events.emitAssistantMessageStart(),
      emitReplyBeat: (beat) => this.events.emitReplyBeat(beat),
      emitTiming: (e) => this.events.emitTiming(e),
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
    // The summary request carries the whole conversation.
    const auth = this.deps.refreshAuth(this.knownFill());
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
        ...(this.thinkingLevel
          ? { effort: toSdkEffort(this.thinkingLevel) }
          : {}),
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

  /** Clear stale tool results before the autocompact check reads the fill, so
   *  it decides on what the next request sends (the resume finds them done). */
  clearStaleToolResults(): number {
    const { conversationId, sessionsStore } = this.deps;
    if (this.disposed || this.compactions.read(conversationId)) return 0;
    const cleared = sessionsStore.resolveResume(conversationId)?.clearedTokens;
    if (cleared && this.contextTokens !== undefined)
      this.contextTokens = Math.max(0, this.contextTokens - cleared);
    return cleared ?? 0;
  }

  /** The context fill measured in this process, else the one recorded. */
  private knownFill(): number | undefined {
    return this.contextTokens ?? this.deps.recordedContextTokens?.();
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
