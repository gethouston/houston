import type { WireFrame } from "@houston/runtime-client";
import { sessionStatus, type TerminalBoardStatus } from "./feed-events";
import { applyTurnFrame } from "./turn-frames";
import { classifyFrame, classifyRunningSync } from "./turn-identity";
import {
  finishErr,
  newTurnState,
  push,
  reloadAndSettle,
  type TurnState,
} from "./turn-settle";
import type { TurnSinkOptions } from "./turn-sink-options";

export type { TurnSinkOptions } from "./turn-sink-options";

/**
 * Folds one conversation's wire frames into the old engine's FeedItem +
 * SessionStatus bus events, and settles the turn ONLY on a terminal frame
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

  constructor(private readonly o: TurnSinkOptions) {
    this.s = newTurnState(o.agentPath, o.sessionKey);
  }

  get settled(): boolean {
    return this.s.settled;
  }
  get terminal(): TerminalBoardStatus | null {
    return this.s.terminal;
  }
  /** Whether a turn was ever observed in flight on this subscription. */
  get active(): boolean {
    return this.sawRunning;
  }
  /** Turn mode: the send returned 202 — a running turn may now be OURS. */
  sendAccepted(): void {
    this.accepted = true;
  }
  /** The send failed / stream broke before a terminal frame: settle as error. */
  fail(msg: string): void {
    finishErr(this.s, msg);
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
    if (ev.type !== "done" && ev.type !== "error") this.sawRunning = true;
    applyTurnFrame(this.s, ev, this.o.stop);
  }

  private onUser(ev: WireFrame & { type: "user" }): void {
    // app/src already renders the user's message optimistically on send (and
    // history hydration covers observed turns), so echoes are never rendered.
    if (this.o.mode === "turn" && this.o.nonce === ev.data.nonce) {
      // OUR echo: the turn started — adopt its id (absent on legacy servers).
      this.turnId = ev.turnId;
      this.accepted = true;
      this.sawRunning = true;
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
      // trigger (turn mode — ignore) or nothing to watch (observer — close).
      if (this.o.mode === "observer") this.o.stop();
    } else if (this.o.mode === "turn" || this.sawRunning) {
      // The turn ended while we were disconnected; persisted history is
      // complete once a turn ends — settle from it, not from partial text.
      this.settleFromHistorySoon();
    } else {
      this.o.stop(); // observer that never saw the turn run: nothing to settle
    }
  }

  private onRunningSync(data: { partial: string; turnId?: string }): void {
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

  private markRunning(): void {
    if (!this.sawRunning && this.o.mode === "observer") {
      // Surface the observed in-flight turn: the running indicator the
      // sender's own page-load would have shown.
      sessionStatus(this.o.agentPath, this.o.sessionKey, "running");
    }
    this.sawRunning = true;
  }

  private settleFromHistorySoon(): void {
    if (this.settling || this.s.settled) return;
    this.settling = true;
    void reloadAndSettle(
      this.s,
      this.o.reloadHistory,
      this.turnId,
      this.o.historyGuard,
      this.o.stop,
    );
  }
}
