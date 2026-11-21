import type { PendingInteraction, WireFrame } from "@houston/runtime-client";
import type { MessageLimitRefusal, ProviderRefusal } from "@houston/wire-types";
import { finishAccountBlocked } from "./account-blocked-refusal";
import type { TerminalBoardStatus } from "./feed-output";
import { PreAcceptTurn } from "./pre-accept-turn";
import type { PresettlePoll } from "./presettle-poll";
import { turnProgressAt } from "./send-hold-clock";
import { SendHoldState } from "./send-hold-state";
import { reloadAndSettle } from "./settle-from-history";
import { sinkPresettlePoll } from "./sink-presettle";
import type { EngineNoticeKind } from "./turn-errors";
import { applyTurnFrame } from "./turn-frames";
import { classifyFrame, classifyRunningSync } from "./turn-identity";
import {
  finishErr,
  finishPlanLimit,
  newTurnState,
  push,
  type TurnState,
} from "./turn-settle";
import type { TurnSinkOptions } from "./turn-sink-options";

export type { TurnSinkOptions } from "./turn-sink-options";

type SyncTool = {
  name: string;
  input?: unknown;
  isError?: boolean;
  content?: string;
  mission?: { id: string; title: string; agent: string };
};

export class TurnSink {
  private readonly s: TurnState;
  private sawRunning = false;
  lastProgressAt?: number;
  private sawSync = false;
  private settling = false;
  private accepted = false;
  private readonly poll: PresettlePoll;
  private readonly held = new SendHoldState();
  private readonly preAccept = new PreAcceptTurn();
  private muted = false;
  private readonly onStarted: Array<() => void> = [];

  constructor(private readonly o: TurnSinkOptions) {
    this.s = newTurnState(o.agentPath, o.sessionKey, o.output, o);
    this.poll = sinkPresettlePoll({
      s: this.s,
      o,
      canArm: () =>
        this.accepted &&
        !this.sawRunning &&
        !this.settling &&
        !this.s.settled &&
        !this.muted,
      hasEvidence: () => this.sawRunning || this.muted,
      adoptTurnId: (turnId) => this.adoptTurnId(turnId),
      settled: () => {
        this.settling = true;
        this.o.stop();
      },
    });
  }

  get settled(): boolean {
    return this.s.settled;
  }
  get terminal(): TerminalBoardStatus | null {
    return this.s.terminal;
  }
  get terminalInteraction(): PendingInteraction | null {
    return this.s.pendingInteraction;
  }
  get active(): boolean {
    return this.sawRunning;
  }
  get turnEnds(): number {
    return this.held.ends.count;
  }
  turnEndAfter(mark: number, signal: AbortSignal): Promise<void> {
    return this.held.ends.after(mark, signal);
  }
  holdSend(): void {
    this.held.hold();
    this.preAccept.clear();
    this.poll.cancel();
  }
  mute(): void {
    this.muted = true;
    this.poll.cancel();
    this.preAccept.release();
  }
  sendAccepted(turnId?: string): void {
    this.held.release();
    const frames = this.preAccept.claim(turnId);
    if (turnId !== undefined) this.adoptTurnId(turnId);
    this.accepted = true;
    this.s.delivered = true;
    for (const ev of frames) this.fold(ev);
    this.poll.arm();
  }
  sendMaybeAccepted(): void {
    this.held.release();
    this.preAccept.release();
    this.accepted = true;
    this.poll.arm();
  }
  fail(msg: string, notice?: EngineNoticeKind): void {
    finishErr(this.s, msg, notice);
  }
  planLimit(refusal: MessageLimitRefusal): void {
    finishPlanLimit(this.s, refusal);
  }
  accountBlocked(refusal: ProviderRefusal): void {
    finishAccountBlocked(this.s, refusal);
  }
  failUnlessStarted(msg: string): boolean {
    if (this.sawRunning || this.settling || this.s.settled) return false;
    finishErr(this.s, msg);
    return true;
  }

  onFrame(ev: WireFrame): void {
    if (this.muted) return;
    this.lastProgressAt = turnProgressAt(ev) ?? this.lastProgressAt;
    this.held.note(ev, this.s.turnId, this.accepted);
    if (this.held.holding && !this.isOwnEcho(ev)) {
      this.preAccept.keepWhileHeld(ev);
      return;
    }
    this.fold(ev);
  }

  private fold(ev: WireFrame): void {
    if (this.muted) return;
    if (this.preAccept.shouldIgnore(ev)) return;
    if (ev.type === "sync") {
      this.onSync(ev);
      return;
    }
    if (ev.type === "user") {
      this.onUser(ev);
      return;
    }
    switch (classifyFrame(this.s.turnId, ev.turnId)) {
      case "foreign":
        if (
          (ev.type === "error" || ev.type === "done") &&
          this.accepted &&
          this.s.turnId === undefined &&
          this.held.mayAdoptTerminal()
        ) {
          this.adoptTurnId(ev.turnId);
          break;
        }
        if (!this.accepted) this.preAccept.keep(ev);
        return;
      case "boundary":
        this.settleFromHistorySoon();
        return;
      case "ours":
        break;
    }
    if (ev.type !== "done" && ev.type !== "error") {
      this.markStarted();
      this.s.delivered = true;
      this.poll.cancel();
    }
    applyTurnFrame(this.s, ev, this.o.stop);
  }

  private isOwnEcho(ev: WireFrame): boolean {
    return (
      ev.type === "user" &&
      this.o.mode === "turn" &&
      this.o.nonce === ev.data.nonce
    );
  }

  private onUser(ev: WireFrame & { type: "user" }): void {
    if (this.isOwnEcho(ev)) {
      this.adoptTurnId(ev.turnId);
      this.held.release();
      this.accepted = true;
      this.markStarted();
      this.s.delivered = true;
      this.poll.cancel();
      return;
    }
    if (classifyFrame(this.s.turnId, ev.turnId) === "boundary") {
      this.settleFromHistorySoon();
    }
  }

  private onSync(ev: WireFrame & { type: "sync" }): void {
    const data = ev.data;
    const reconnect = this.sawSync || data.resync === true;
    this.sawSync = true;
    this.preAccept.clear();
    if (data.running) {
      this.onRunningSync(ev);
      return;
    }
    if (!reconnect) {
      if (this.o.mode === "observer") {
        this.o.output.confirmIdle?.(this.o.agentPath, this.o.sessionKey);
        this.o.stop();
      } else {
        this.poll.arm();
      }
    } else if (this.o.mode === "turn" && !this.accepted && !this.sawRunning) {
    } else if (this.o.mode === "turn" || this.sawRunning) {
      this.settleFromHistorySoon();
    } else {
      this.o.output.confirmIdle?.(this.o.agentPath, this.o.sessionKey);
      this.o.stop();
    }
  }

  private onRunningSync(ev: WireFrame & { type: "sync" }): void {
    const data = ev.data;
    const mayAdopt = this.o.mode === "observer" || this.accepted;
    switch (classifyRunningSync(this.s.turnId, data.turnId, mayAdopt)) {
      case "foreign":
        this.preAccept.keepSync(ev);
        return;
      case "boundary":
        this.settleFromHistorySoon();
        return;
      case "adopt":
        if (!this.held.mayAdoptRunning(data.turnId)) return;
        this.adoptTurnId(data.turnId);
        break;
      case "ours":
        break;
    }
    this.markRunning();
    this.replaySyncActivity(data);
    if (this.s.text !== data.partial) {
      this.s.text = data.partial;
      push(this.s, {
        feed_type: "assistant_text_streaming",
        data: this.s.text,
      });
    }
  }

  private replaySyncActivity(data: {
    thinking?: string;
    tools?: SyncTool[];
  }): void {
    const s = this.s;
    if (data.thinking && data.thinking !== s.thinking) {
      s.thinking = data.thinking;
      push(s, { feed_type: "thinking_streaming", data: s.thinking });
    }
    const tools = data.tools ?? [];
    while (s.toolResultsSeen < Math.min(s.toolsSeen, tools.length)) {
      const t = tools[s.toolResultsSeen];
      if (t.isError === undefined) break;
      push(s, {
        feed_type: "tool_result",
        data: {
          name: t.name,
          content: t.content ?? "",
          is_error: t.isError,
          ...(t.mission ? { mission: t.mission } : {}),
        },
        toolIndex: s.toolResultsSeen,
      });
      s.toolResultsSeen++;
    }
    while (s.toolsSeen < tools.length) {
      const t = tools[s.toolsSeen];
      push(s, {
        feed_type: "tool_call",
        data: { name: t.name, input: t.input ?? {} },
        toolIndex: s.toolsSeen,
      });
      s.toolsSeen++;
      if (t.isError !== undefined) {
        push(s, {
          feed_type: "tool_result",
          data: {
            name: t.name,
            content: t.content ?? "",
            is_error: t.isError,
            ...(t.mission ? { mission: t.mission } : {}),
          },
          toolIndex: s.toolResultsSeen,
        });
        s.toolResultsSeen++;
      }
    }
  }

  private markRunning(): void {
    if (!this.sawRunning && this.o.mode === "observer") {
      this.o.output.sessionStatus(
        this.o.agentPath,
        this.o.sessionKey,
        "running",
      );
    }
    this.markStarted();
    this.s.delivered = true;
    this.poll.cancel();
  }

  private adoptTurnId(turnId: string | undefined): void {
    if (turnId === undefined) return;
    this.s.turnId ??= turnId;
    this.preAccept.clear();
    if (this.o.mode === "turn")
      this.o.output.stampUserTurn?.(
        this.o.agentPath,
        this.o.sessionKey,
        turnId,
      );
  }

  private settleFromHistorySoon(): void {
    if (this.settling || this.s.settled) return;
    this.poll.cancel();
    this.settling = true;
    void reloadAndSettle(
      this.s,
      this.o.reloadHistory,
      this.s.turnId,
      this.o.historyGuard,
      this.o.stop,
      (turnId) => this.adoptTurnId(turnId),
      () => !this.muted,
    );
  }

  whenStarted(cb: () => void): void {
    if (this.sawRunning) cb();
    else this.onStarted.push(cb);
  }

  private markStarted(): void {
    if (this.sawRunning) return;
    this.sawRunning = true;
    for (const cb of this.onStarted.splice(0)) cb();
  }

  dispose(): void {
    this.muted = true;
    this.poll.cancel();
    this.preAccept.release();
  }
}
