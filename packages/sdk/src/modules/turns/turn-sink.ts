import type { PendingInteraction, WireFrame } from "@houston/runtime-client";
import type { TerminalBoardStatus } from "./feed-output";
import { presettleFromHistory, reloadAndSettle } from "./settle-from-history";
import { applyTurnFrame } from "./turn-frames";
import { classifyFrame, classifyRunningSync } from "./turn-identity";
import { finishErr, newTurnState, push, type TurnState } from "./turn-settle";
import type { TurnSinkOptions } from "./turn-sink-options";

export type { TurnSinkOptions } from "./turn-sink-options";

/** One of the running turn's tools, as the `sync` frame reports it. */
type SyncTool = {
  name: string;
  input?: unknown;
  isError?: boolean;
  content?: string;
};

/**
 * Folds one conversation's wire frames into FeedItem + SessionStatus pushes on
 * the sink's {@link FeedOutput}, and settles the turn ONLY on a terminal frame
 * (`done` / `error` / `provider_error`) or on a server-confirmed "the turn is
 * over and its replay is lost" sync — never on a mere transport close (that
 * was the truncation bug: a dropped stream used to settle from partial text).
 *
 * Frames are matched to OUR turn by `turnId` (see `turn-identity.ts` for the
 * decision table): a frame or running sync naming a DIFFERENT turn is a turn
 * boundary — our turn is over, its terminal frame lost, so we settle from
 * persisted history by our turnId and stop. Neither mode adopts the new turn:
 * the sender's own client renders it live, and the observer registry
 * re-attaches on the next conversation open. Legacy servers stamp nothing and
 * keep today's best-effort continuation semantics.
 */
export class TurnSink {
  private readonly s: TurnState;
  /** OUR turn's id, once known (nonce-matched echo / attaching sync). */
  private turnId: string | undefined;
  /** Evidence a turn was in flight on our watch (frames or a running sync). */
  private sawRunning = false;
  private sawSync = false;
  private settling = false;
  /** Turn mode: the send was accepted — gates resync turn-id adoption. */
  private accepted = false;
  /** Turn mode: a FRESH idle sync was seen — half the pre-settled poll trigger. */
  private sawFreshIdleSync = false;
  /** The pre-settled poll timer, live only while armed (see `maybeArmPresettlePoll`). */
  private presettleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly o: TurnSinkOptions) {
    this.s = newTurnState(o.agentPath, o.sessionKey, o.output, {
      provider: o.provider,
      prompt: o.prompt,
    });
  }

  get settled(): boolean {
    return this.s.settled;
  }
  get terminal(): TerminalBoardStatus | null {
    return this.s.terminal;
  }
  /** The interaction a clean turn settled on (rides the terminal persist), or null. */
  get terminalInteraction(): PendingInteraction | null {
    return this.s.pendingInteraction;
  }
  /** Whether a turn was ever observed in flight on this subscription. */
  get active(): boolean {
    return this.sawRunning;
  }
  /** Turn mode: the send returned 202 — a running turn may now be OURS. */
  sendAccepted(): void {
    this.accepted = true;
    // The engine acknowledged the send — the message reached it, so the
    // optimistic bubble is delivered even if the turn later errors.
    this.s.delivered = true;
    // The send landed while the stream already showed a fresh idle sync: the
    // turn may have completed before we attached — arm the pre-settled poll.
    this.maybeArmPresettlePoll();
  }
  /**
   * Turn mode: the send failed at the TRANSPORT level, so the engine may have
   * accepted it anyway (the 202 was lost with the connection). Adopt the same
   * posture as an accepted send — a running sync on reconnect may be OUR turn
   * — while `failUnlessStarted` arbitrates whether it really began.
   */
  sendMaybeAccepted(): void {
    this.accepted = true;
    // If the engine did accept it and the turn already finished, the pre-settled
    // poll can settle it conclusively — faster than the ambiguous-send verdict
    // window failing it as lost.
    this.maybeArmPresettlePoll();
  }
  /** The send failed / stream broke before a terminal frame: settle as error. */
  fail(msg: string): void {
    finishErr(this.s, msg);
  }
  /**
   * Verdict on an ambiguous send: settle as an error UNLESS evidence arrived
   * that the turn actually started (our nonce echo, frames, a running sync) or
   * a settle is already underway. Returns whether it failed the turn, so the
   * caller knows to tear the stream down.
   */
  failUnlessStarted(msg: string): boolean {
    if (this.sawRunning || this.settling || this.s.settled) return false;
    finishErr(this.s, msg);
    return true;
  }

  onFrame(ev: WireFrame): void {
    if (ev.type === "sync") {
      this.onSync(ev.data);
      return;
    }
    if (ev.type === "user") {
      this.onUser(ev);
      return;
    }
    switch (classifyFrame(this.turnId, ev.turnId)) {
      case "foreign":
        return; // another turn's frame — never fold it into ours
      case "boundary":
        // A new turn owns the stream: OUR turn is over and its terminal frame
        // was lost — settle exactly, from persisted history by our turnId.
        this.settleFromHistorySoon();
        return;
      case "ours":
        break;
    }
    if (ev.type !== "done" && ev.type !== "error") {
      this.sawRunning = true;
      this.s.delivered = true; // a real frame proves the turn started
      this.cancelPresettlePoll(); // stream evidence: the poll's job is done
    }
    applyTurnFrame(this.s, ev, this.o.stop);
  }

  private onUser(ev: WireFrame & { type: "user" }): void {
    // The app already renders the user's message optimistically on send (and
    // history hydration covers observed turns), so echoes are never rendered.
    if (this.o.mode === "turn" && this.o.nonce === ev.data.nonce) {
      // OUR echo: the turn started — adopt its id (absent on legacy servers).
      this.turnId = ev.turnId;
      this.accepted = true;
      this.sawRunning = true;
      this.s.delivered = true; // the engine echoed our send — it landed
      this.cancelPresettlePoll(); // the turn is demonstrably live on the stream
      return;
    }
    if (classifyFrame(this.turnId, ev.turnId) === "boundary") {
      // Another writer started the NEXT turn: ours is over, terminal lost.
      this.settleFromHistorySoon();
    }
  }

  private onSync(data: {
    running: boolean;
    partial: string;
    resync?: boolean;
    turnId?: string;
    thinking?: string;
    tools?: SyncTool[];
  }): void {
    // Any sync after the first is a reconnect catch-up: seq servers only
    // re-sync when our cursor was unserviceable (`resync: true`), legacy
    // servers on every reconnect. Either way the frames in between are LOST.
    const reconnect = this.sawSync || data.resync === true;
    this.sawSync = true;
    if (data.running) {
      this.onRunningSync(data);
      return;
    }
    if (!reconnect) {
      // Fresh-connect sync of an idle conversation: a turn we're about to
      // trigger (turn mode — ignore for an immediate settle) or nothing to
      // watch (observer — close). In turn mode this same shape ALSO covers a
      // turn that finished before we attached (frames never replayed): remember
      // we saw it and arm the pre-settled poll, which settles conclusively from
      // history if no stream evidence follows.
      if (this.o.mode === "observer") {
        // Server-confirmed idle: reconcile any output whose state still says
        // "running" — a stream torn down without a settle (client teardown)
        // leaves the VM stale, and nothing else ever corrects it.
        this.o.output.confirmIdle?.(this.o.agentPath, this.o.sessionKey);
        this.o.stop();
      } else {
        this.sawFreshIdleSync = true;
        this.maybeArmPresettlePoll();
      }
    } else if (this.o.mode === "turn" || this.sawRunning) {
      // The turn ended while we were disconnected; persisted history is
      // complete once a turn ends — settle from it, not from partial text.
      this.settleFromHistorySoon();
    } else {
      // Observer that never saw the turn run: nothing to settle, but the sync
      // confirms the conversation is idle — reconcile stale state (as above).
      this.o.output.confirmIdle?.(this.o.agentPath, this.o.sessionKey);
      this.o.stop();
    }
  }

  private onRunningSync(data: {
    partial: string;
    turnId?: string;
    thinking?: string;
    tools?: SyncTool[];
  }): void {
    const mayAdopt = this.o.mode === "observer" || this.accepted;
    switch (classifyRunningSync(this.turnId, data.turnId, mayAdopt)) {
      case "foreign":
        return; // another writer's turn, seen pre-send — not ours to render
      case "boundary":
        this.settleFromHistorySoon(); // ours ended; a new turn runs
        return;
      case "adopt":
        this.turnId = data.turnId;
        break;
      case "ours":
        break;
    }
    this.markRunning();
    // Replay the running turn's activity BEFORE the text so the mission log
    // folds in live order (thinking, then tools, then the reply bubble).
    this.replaySyncActivity(data);
    // The server's authoritative in-flight assistant text REPLACES our
    // accumulation — empty string included: a stale splice must never survive
    // a resync. (Replayed frames, when servable, never reach a sync.)
    if (this.s.text !== data.partial) {
      this.s.text = data.partial;
      push(this.s, {
        feed_type: "assistant_text_streaming",
        data: this.s.text,
      });
    }
  }

  /**
   * Fold a running sync's `thinking`/`tools` (what streamed BEFORE we
   * connected — a fresh attach gets no frame replay) into the feed, deduped
   * so a resync never doubles what live frames or an earlier sync already
   * pushed (HOU-717). Absent fields (pre-field server, or a turn with no
   * activity yet) fold nothing.
   */
  private replaySyncActivity(data: {
    thinking?: string;
    tools?: SyncTool[];
  }): void {
    const s = this.s;
    if (data.thinking && data.thinking !== s.thinking) {
      // Server-authoritative cumulative reasoning, same posture as `partial`.
      s.thinking = data.thinking;
      push(s, { feed_type: "thinking_streaming", data: s.thinking });
    }
    const tools = data.tools ?? [];
    // A tool whose call we already pushed may have ENDED while we were away —
    // close it first (tools run serially, so results land in call order).
    while (s.toolResultsSeen < Math.min(s.toolsSeen, tools.length)) {
      const t = tools[s.toolResultsSeen];
      if (t.isError === undefined) break;
      push(s, {
        feed_type: "tool_result",
        data: { content: t.content ?? "", is_error: t.isError },
      });
      s.toolResultsSeen++;
    }
    // Then the calls we never saw, each with its result when it already ended.
    while (s.toolsSeen < tools.length) {
      const t = tools[s.toolsSeen];
      s.toolsSeen++;
      push(s, {
        feed_type: "tool_call",
        data: { name: t.name, input: t.input ?? {} },
      });
      if (t.isError !== undefined) {
        push(s, {
          feed_type: "tool_result",
          data: { content: t.content ?? "", is_error: t.isError },
        });
        s.toolResultsSeen++;
      }
    }
  }

  private markRunning(): void {
    if (!this.sawRunning && this.o.mode === "observer") {
      // Surface the observed in-flight turn: the running indicator the
      // sender's own page-load would have shown.
      this.o.output.sessionStatus(
        this.o.agentPath,
        this.o.sessionKey,
        "running",
      );
    }
    this.sawRunning = true;
    this.s.delivered = true; // a running sync proves the turn is live on the engine
    this.cancelPresettlePoll(); // a running turn on the stream: the poll is moot
  }

  private settleFromHistorySoon(): void {
    if (this.settling || this.s.settled) return;
    this.cancelPresettlePoll(); // a confirmed-lost-terminal settle supersedes the poll
    this.settling = true;
    void reloadAndSettle(
      this.s,
      this.o.reloadHistory,
      this.turnId,
      this.o.historyGuard,
      this.o.stop,
    );
  }

  /**
   * Arm the pre-settled poll when BOTH triggers hold — a fresh idle sync was
   * seen AND the send is accepted — and no evidence/settle already closed the
   * question. Idempotent: a second call while armed is a no-op. Absent
   * `presettledPollMs` (observer mode) disables the poll entirely.
   */
  private maybeArmPresettlePoll(): void {
    if (this.o.presettledPollMs === undefined) return;
    if (!this.accepted || !this.sawFreshIdleSync) return;
    if (this.sawRunning || this.settling || this.s.settled) return;
    if (this.presettleTimer !== undefined) return;
    this.presettleTimer = setTimeout(() => {
      this.presettleTimer = undefined;
      void this.pollForPresettled();
    }, this.o.presettledPollMs);
  }

  private cancelPresettlePoll(): void {
    if (this.presettleTimer !== undefined) {
      clearTimeout(this.presettleTimer);
      this.presettleTimer = undefined;
    }
  }

  /**
   * Reload history and settle ONLY on conclusive proof the turn finished (a
   * reply for our turnId, or a legacy trailing reply the guard accepts). This
   * is the sole caller of the CONCLUSIVE-ONLY {@link presettleFromHistory} —
   * never the fall-through `settleFromHistory`, whose no-reply branch would
   * WRONGLY error a healthy slow turn (its history ends on our trailing user
   * message). Inconclusive re-arms the poll; any stream evidence in the interim
   * cancels it, and the reconnect budget still owns a genuinely lost stream.
   */
  private async pollForPresettled(): Promise<void> {
    if (this.settling || this.s.settled || this.sawRunning) return;
    const settled = await presettleFromHistory(
      this.s,
      this.o.reloadHistory,
      this.turnId,
      this.o.historyGuard,
      () => this.sawRunning,
    );
    if (settled) {
      this.settling = true;
      this.o.stop();
      return;
    }
    // Inconclusive: the turn hasn't proven it finished. Re-arm and keep the
    // stream as the authority (frames cancel the poll; the budget owns loss).
    this.maybeArmPresettlePoll();
  }

  /** Teardown: clear the poll timer so an aborted stream leaves nothing pending. */
  dispose(): void {
    this.cancelPresettlePoll();
  }
}
