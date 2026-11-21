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
import { resumeFill } from "./session-fill";
import { runSessionTurn } from "./session-prompt";
import type { TurnAttemptState } from "./session-turn-attempt";

export type { ClaudeQuery, ClaudeSessionDeps, TurnAuth } from "./session-deps";

export class ClaudeSession
  extends SessionEventSubscriptions
  implements HarnessSession
{
  private disposed = false;
  private aborting = false;
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

  async compact(
    customInstructions?: string,
  ): Promise<CompactionOutcome | undefined> {
    if (this.disposed) return undefined;
    const auth = this.deps.refreshAuth(this.knownFill());
    this.usedAccessDigest = auth.accessDigest;
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
    this.contextTokens = undefined;
    return outcome;
  }

  clearStaleToolResults(): number {
    const { conversationId, sessionsStore } = this.deps;
    if (this.disposed || this.compactions.read(conversationId)) return 0;
    const cleared = sessionsStore.resolveResume(conversationId)?.clearedTokens;
    const fill = this.getContextUsage()?.tokens;
    if (cleared && fill != null)
      this.contextTokens = Math.max(0, fill - cleared);
    return cleared ?? 0;
  }

  private knownFill(): number | undefined {
    return this.contextTokens ?? this.deps.recordedContextTokens?.();
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.thinkingLevel = level;
  }

  getContextUsage(): { tokens: number | null } | undefined {
    const tokens = resumeFill(this.contextTokens, this.deps, this.compactions);
    return tokens === undefined ? undefined : { tokens };
  }
}
