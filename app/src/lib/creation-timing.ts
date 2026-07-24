/**
 * Agent-creation stopwatch (HOU-867) — pure core, deps injected (the wired
 * singleton lives in `creation-timing-live.ts`).
 *
 * One record per create. The dialog starts it on the Create click and each
 * later phase stamps itself as the flow reaches it: the create POST answering,
 * the board reveal, the engine turning ready (hosted warm-up), the setup
 * mission's turn going out, and finally the agent's first visible output.
 * When the first output lands (or the watch gives up) the whole breakdown is
 * emitted as ONE payload, so a slow create shows WHERE the time went instead
 * of just feeling long.
 */

/** Feed items that mean "the agent said or did something". */
const AGENT_OUTPUT_TYPES = new Set([
  "assistant_text",
  "assistant_text_streaming",
  "thinking",
  "thinking_streaming",
  "tool_call",
]);

export function isAgentOutputItem(item: { feed_type: string }): boolean {
  return AGENT_OUTPUT_TYPES.has(item.feed_type);
}

export function hasAgentOutput(feed: Array<{ feed_type: string }>): boolean {
  return feed.some(isAgentOutputItem);
}

/** Stop watching for a first reply after this long — emit what we have. */
export const CREATION_GIVE_UP_MS = 10 * 60_000;

export type CreationOutcome =
  /** The agent's first output reached the feed — the full, happy breakdown. */
  | "replied"
  /** The create POST itself failed; nothing further can happen. */
  | "failed"
  /** A new create started while this one was still being watched. */
  | "superseded"
  /** No first output within the watch window (pod never answered, or the
   *  user closed the mission before the turn ran). */
  | "gave_up";

export interface CreationTimingDeps {
  now(): number;
  /** Deliver the finished breakdown (analytics + log). */
  emit(payload: Record<string, unknown>): void;
  /** One line per phase mark, for the live log. */
  log(line: string): void;
  /**
   * Watch a conversation's feed; MUST call `cb` with the current feed
   * immediately and again on every change. Returns an unsubscribe.
   */
  watchFeed(
    agentPath: string,
    sessionKey: string,
    cb: (feed: Array<{ feed_type: string }>) => void,
  ): () => void;
  /** True when the engine is remote (hosted gateway) — warm-up exists. */
  remoteEngine(): boolean;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
}

interface CreationRecord {
  startedAt: number;
  createdAt?: number;
  revealedAt?: number;
  engineReadyAt?: number;
  introDispatchedAt?: number;
  agentId?: string;
  sessionKey?: string;
  unwatch?: () => void;
  giveUpTimer?: unknown;
}

const round = (ms: number) => Math.round(ms);

/** The emitted breakdown. Null = the flow never reached that phase. */
export function buildTimingPayload(
  record: CreationRecord,
  outcome: CreationOutcome,
  endedAt: number,
  remoteEngine: boolean,
): Record<string, unknown> {
  const { startedAt, createdAt, revealedAt, engineReadyAt, introDispatchedAt } =
    record;
  const dispatchBase = engineReadyAt ?? createdAt ?? startedAt;
  return {
    outcome,
    remote_engine: remoteEngine,
    /** Create click → POST /agents answered (the button spinner). */
    create_request_ms: createdAt != null ? round(createdAt - startedAt) : null,
    /** Create click → board revealed with the optimistic mission card. */
    reveal_ms: revealedAt != null ? round(revealedAt - startedAt) : null,
    /** POST answered → engine answered the readiness probe (pod warm-up). */
    warming_ms:
      engineReadyAt != null && createdAt != null
        ? round(engineReadyAt - createdAt)
        : null,
    /** Engine ready → setup-mission turn accepted by the engine. */
    dispatch_ms:
      introDispatchedAt != null
        ? round(introDispatchedAt - dispatchBase)
        : null,
    /** Turn accepted → the agent's first visible output. */
    first_reply_ms:
      outcome === "replied"
        ? round(endedAt - (introDispatchedAt ?? dispatchBase))
        : null,
    /** Create click → first output (or to giving up). */
    total_ms: round(endedAt - startedAt),
  };
}

export class CreationStopwatch {
  private record: CreationRecord | null = null;
  private deps: CreationTimingDeps;

  constructor(deps: CreationTimingDeps) {
    this.deps = deps;
  }

  /** Create clicked. Supersedes any creation still being watched. */
  begin(): void {
    if (this.record) this.finish("superseded");
    const startedAt = this.deps.now();
    this.record = { startedAt };
    this.record.giveUpTimer = this.deps.setTimer(
      () => this.finish("gave_up"),
      CREATION_GIVE_UP_MS,
    );
    this.deps.log("[creation-timing] create clicked");
  }

  /** The create POST answered — the agent record exists. */
  markCreated(agentId: string): void {
    if (!this.record || this.record.createdAt != null) return;
    this.record.agentId = agentId;
    this.record.createdAt = this.deps.now();
    this.mark("created", this.record.createdAt);
  }

  /** The board revealed (optimistic mission card visible). */
  markRevealed(): void {
    if (!this.record || this.record.revealedAt != null) return;
    this.record.revealedAt = this.deps.now();
    this.mark("revealed", this.record.revealedAt);
  }

  /** The create POST failed — emit the partial breakdown and stop. */
  fail(): void {
    if (this.record) this.finish("failed");
  }

  /**
   * The setup mission's conversation exists — watch its feed for the first
   * agent output.
   */
  bindConversation(agentPath: string, sessionKey: string): void {
    const record = this.record;
    if (!record || record.sessionKey) return;
    record.sessionKey = sessionKey;
    record.unwatch = this.deps.watchFeed(agentPath, sessionKey, (feed) => {
      if (this.record === record && hasAgentOutput(feed)) {
        this.finish("replied");
      }
    });
  }

  /** The warm-up probe cleared (hosted only). */
  markEngineReady(agentId: string): void {
    const record = this.record;
    if (!record || record.agentId !== agentId) return;
    if (record.engineReadyAt != null) return;
    record.engineReadyAt = this.deps.now();
    this.mark("engine ready", record.engineReadyAt);
  }

  /** The setup-mission turn was accepted by the engine. */
  markIntroDispatched(sessionKey: string): void {
    const record = this.record;
    if (!record || record.sessionKey !== sessionKey) return;
    if (record.introDispatchedAt != null) return;
    record.introDispatchedAt = this.deps.now();
    this.mark("intro dispatched", record.introDispatchedAt);
  }

  private mark(phase: string, at: number): void {
    if (!this.record) return;
    this.deps.log(
      `[creation-timing] ${phase} +${round(at - this.record.startedAt)}ms`,
    );
  }

  private finish(outcome: CreationOutcome): void {
    const record = this.record;
    if (!record) return;
    this.record = null;
    record.unwatch?.();
    if (record.giveUpTimer != null) this.deps.clearTimer(record.giveUpTimer);
    this.deps.emit(
      buildTimingPayload(
        record,
        outcome,
        this.deps.now(),
        this.deps.remoteEngine(),
      ),
    );
  }
}
