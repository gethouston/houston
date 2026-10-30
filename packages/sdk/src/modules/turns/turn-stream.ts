import {
  type GrantableOperation,
  isAutoContinue,
  type MessageApproval,
} from "@houston/protocol";
import type { HoustonEngineClient } from "@houston/runtime-client";
import { streamEventsResumable } from "@houston/runtime-client";
import { TurnBoardWrites } from "./board-writes";
import type { FeedOutput } from "./feed-output";
import { FirstResponseClock } from "./first-response";
import type { PersonStop } from "./person-stop";
import { randomNonce } from "./random-nonce";
import { computeBusyRefusal } from "./send-busy";
import { observerSettled } from "./send-hold";
import {
  duplicateSendItem,
  refusedResendItem,
  settleRefusedSend,
} from "./send-refusal-item";
import { armHandoffStop, sendUntilAccepted } from "./send-wait";
import {
  type ActiveStream,
  PRESETTLED_POLL_MS,
  SEND_LOST_MESSAGE,
  SEND_VERDICT_MS,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  type StreamRegistry,
  type StreamTuning,
  streamKey,
} from "./stream-registry";
import {
  engineVerdictMessage,
  isAmbiguousSendFailure,
  STOPPED_BY_USER,
} from "./turn-errors";
import { isTurnRunningRejection } from "./turn-running";
import { TurnSink } from "./turn-sink";
import type { FeedAuthor, FeedMention } from "./vm-output";

export { observeConversation } from "./observe-stream";
export type { StreamRegistry, StreamTuning } from "./stream-registry";

/**
 * Per-turn provider/model/effort pin, in ENGINE ids, sent on the send wire.
 * The runtime runs the turn on exactly this provider/model — never auth-gated
 * onto another one — the same contract as a routine's pin. This is what keeps
 * every conversation on ITS OWN picked provider regardless of the agent-wide
 * settings (HOU-695); omitted fields fall back to the runtime's resolution.
 */
export interface TurnWirePin {
  provider?: string;
  model?: string;
  effort?: string;
  /** Per-turn execution mode ("plan" = read-only + planning overlay; "auto" =
   *  Autopilot, acts without the blocking tools). Omitted runs the turn as
   *  "execute", the runtime's default for an unpinned turn. */
  mode?: "execute" | "plan" | "auto";
}

/** Optional knobs for {@link streamTurn}. */
export interface StreamTurnOptions {
  /** Override the wire nonce (default: a fresh UUID). Its `user` echo names our turnId. */
  nonce?: string;
  /**
   * The provider this turn targets (caller's id dialect). Only labels the
   * typed reconnect card when the runtime refuses the send as not-connected —
   * the runtime can't name a provider in that refusal (nothing is connected).
   * The pin actually sent on the wire is `pin` (engine ids), not this.
   */
  provider?: string;
  /** The wire pin this turn runs on (see {@link TurnWirePin}). */
  pin?: TurnWirePin;
  /** Reconnect tuning (tests inject fast backoff). */
  tuning?: StreamTuning;
  /**
   * Skip the optimistic user bubble — for resends of a prompt whose bubble is
   * already in the feed (a refused not-connected send being retried).
   */
  suppressUserBubble?: boolean;
  /**
   * What the user's bubble renders, when it must differ from `prompt` (the real
   * text the engine runs on). The optimistic bubble shows `displayText ?? prompt`
   * and the runtime persists it so a history reload renders the same — while the
   * model always receives `prompt`. Set it when the prompt carries text the user
   * should never see: a hidden setup-mission directive, or appended attachment
   * paths. Omitted when the bubble and the prompt are the same string.
   */
  displayText?: string;
  /**
   * Who is sending this turn, in a MULTIPLAYER deployment: the acting user's
   * identity, stamped onto the optimistic bubble so a shared conversation
   * attributes it from the instant it appears — matching the `author` the
   * gateway persists and history replays. The SDK never infers it (it has no
   * identity of its own); a caller with no signed-in user omits it and the
   * bubble stays authorless, exactly as single-player renders today.
   */
  author?: FeedAuthor;
  /**
   * The teammates this turn @mentions (HOU-944): the structured sidecar the
   * composer resolved for the `@Name` text inside `prompt`, stamped onto the
   * optimistic bubble so a shared conversation chips those names from the
   * instant it appears — matching the `mentions` the runtime persists and
   * history replays. The model only ever sees the plain text. The SDK never
   * infers it; omitted (or empty) leaves the bubble unchipped, exactly as
   * single-player renders today.
   */
  mentions?: FeedMention[];
  /**
   * The approval cards this turn's message answers. It is a wire passenger, not
   * SDK behaviour: the HOST reads it off the request, records the receipts, and
   * drops it before the runtime sees it, because the host is the process that
   * holds the credential the approved operation would use. Nothing here reads
   * it, and no feed item is derived from it.
   */
  approvals?: MessageApproval[];
  /**
   * A new mission's first message: the runtime titles the card after this
   * turn's reply (see the wire's `SessionStartRequest.missionTitle`). A wire
   * passenger like `approvals`, set only on a new mission's first send.
   */
  missionTitle?: { fallback: string; text: string };
  grants?: GrantableOperation[];
}

/**
 * Run one turn against the engine and translate its events into FeedItem +
 * SessionStatus pushes on `output`.
 *
 * Subscribe FIRST (so the terminal frame can't be missed), then trigger the
 * turn (`sendMessage` with a nonce; its `user` echo names our turnId). The
 * subscription is RESUMABLE: a dropped or idle connection silently reconnects
 * with `?after=<last seq>` and replays the gap, so a transport close never
 * settles the turn. The turn settles ONLY on a terminal frame for OUR turn, on
 * a sync/frame that proves our turn ended while we were away (then from
 * persisted history, by turnId), on a rejected send, on a fatal (401/403/404/
 * 410) stream refusal, or after `STREAM_FAILURE_BUDGET` dead reconnects —
 * never from partial text on a silent close.
 *
 * A send that fails at the TRANSPORT level (fetch threw — no engine verdict)
 * is AMBIGUOUS: the engine may have accepted the message and be running the
 * turn with only the 202 lost to the dropped connection. Failing the turn
 * immediately would render an error card against a live turn whose reply then
 * lands anyway (HOU-683). So the ambiguous path settles nothing: the already-
 * open subscription arbitrates — our nonce echo or a running sync proves the
 * turn started (it then renders and settles normally); if no evidence arrives
 * within `tuning.sendVerdictMs`, the send provably never landed and the turn
 * fails with `SEND_LOST_MESSAGE`. A definitive rejection (the engine answered:
 * EngineError) or the caller's own abort still fails immediately.
 *
 * When a live observer holds the conversation, the send goes FIRST and the
 * observer keeps rendering until it is accepted: a 202 disposes the observer
 * and the turn stream resumes from the observer's cursor (so no frame — our
 * `user` echo included — is lost); a rejected send (e.g. the cloud's one-turn
 * gate answering 409 while the observed turn runs) leaves the observer
 * rendering and surfaces the refusal as a system message WITHOUT settling the
 * conversation as an error — a turn is demonstrably running and its card must
 * stay running.
 *
 * `registry` is the caller's stream set (one per SDK / adapter) — passed
 * explicitly so two owners never share a map and cross-abort each other.
 */
export async function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
  output: FeedOutput,
  registry: StreamRegistry,
  opts: StreamTurnOptions = {},
): Promise<void> {
  // The turn's first-response clock starts at dispatch and reports once: the
  // first visible text this turn folds, or how it ended without one.
  const firstResponse = new FirstResponseClock(
    (response) => output.firstResponse?.(agentPath, sessionKey, response),
    opts.tuning?.firstResponseTimeoutMs,
  );
  const key = registry.noteTurnStart(streamKey(agentPath, sessionKey));
  // Status BEFORE the bubble: `running: false` must mean settled-or-idle, so a
  // watcher can't mistake the optimistic-push snapshot for a settled turn.
  output.sessionStatus(agentPath, sessionKey, "running");
  // An EMPTY @mention list means exactly what absence means (nobody was
  // mentioned), so it is normalized away ONCE, here: neither the optimistic
  // bubble nor the wire body ever carries `mentions: []`.
  const mentions = opts.mentions?.length ? opts.mentions : undefined;
  // The optimistic user bubble: the surface never renders it itself, and the
  // sink never renders the server's echo of it (nonce-matched) — this push is
  // the ONE place a sent prompt enters the feed. Marker-tagged prompts
  // (auto-continue) are filtered at render, same as their persisted copies.
  // Pushed `pending: true` — the engine has not confirmed it yet — and the VM
  // strips that on the first server evidence (any later push, or a terminal
  // status). Every early return below pushes a system_message afterward, so no
  // path leaves the bubble stuck pending.
  // A hidden auto-continue prompt has no bubble to push, exactly as history
  // folds it away (history.ts): the user never wrote it.
  if (!opts.suppressUserBubble && !isAutoContinue(prompt)) {
    output.pushFeedItem(agentPath, sessionKey, {
      feed_type: "user_message",
      // The bubble renders displayText when the real prompt carries text the
      // user should never see (a hidden directive / appended attachment paths);
      // the engine still receives `prompt` below.
      data: opts.displayText ?? prompt,
      pending: true,
      // Multiplayer: who is sending. Absent single-player (no identity).
      author: opts.author,
      // Multiplayer: the teammates this message @mentions, chipping the bubble
      // from the instant it appears — the same list the send carries below.
      mentions,
    });
  }
  // Flip the card to "running" for this turn (re-running a needs_you/done
  // activity must reset it) and CLEAR any interaction the prior settle stored
  // (null) — a re-run is no longer waiting on the user. Fire concurrently so it
  // never delays turn start; persistBoardStatus surfaces its own failure.
  // Every later write to this card queues behind it (board-writes.ts).
  const board = new TurnBoardWrites(output, agentPath, sessionKey);
  void board.persist("running", null, { stamp: "last_message" });

  const nonce = opts.nonce ?? randomNonce();
  const prior = registry.get(key);
  // A previous turn's stream must be disposed (aborted), never silently
  // overwritten — two live turn subscriptions would render frames twice.
  if (prior?.kind === "turn") {
    prior.dispose();
    registry.delete(key);
  }

  const sendOptions = {
    nonce,
    ...opts.pin,
    displayText: opts.displayText,
    mentions,
    approvals: opts.approvals,
    missionTitle: opts.missionTitle,
    grants: opts.grants,
  };
  // Observer→turn handoff. The cursor snapshot happens BEFORE the send so the
  // resumed stream replays everything from that point — our `user` echo (the
  // turnId source) included, even if the observer consumed it before disposal.
  let after: number | undefined;
  let sent = false;
  // The handoff send's busy refusal, re-sent held on the fresh path, and
  // when that send went out.
  let handoffRefusal: unknown;
  let handoffSentAt: number | undefined;
  // Set when the person stopped the handoff's send before it landed:
  // resolves once the engine's cancel answered.
  let stoppedBeforeSend: PersonStop | undefined;
  const refuseDuplicate = () => {
    output.pushFeedItem(agentPath, sessionKey, duplicateSendItem);
    firstResponse.resolve("error");
  };
  if (prior?.kind !== "observer" && registry.isSending(key)) {
    // Another send still hands off on this key, its observer gone meanwhile:
    // never a second real send beside it.
    refuseDuplicate();
    return;
  }
  if (prior?.kind === "observer") {
    // Claim the per-key send lock SYNCHRONOUSLY, before the first await: the
    // observer entry still holds the key across `sendMessage`, so without this a
    // second concurrent streamTurn would also see the observer as prior and fire
    // a second real send + attach a second sink (double render). The loser fails
    // fast; the observer keeps rendering the running turn.
    if (!registry.beginSend(key)) {
      refuseDuplicate();
      return;
    }
    after = prior.lastSeq;
    // The key is the observer's until this send lands: a Stop meanwhile
    // reaches this hook, not a turn entry.
    // A Stop disposes the observer at once: a terminal frame it already has
    // must not report the conversation idle before the cancel answered.
    const handoffStop = armHandoffStop(registry, key, () => prior.dispose());
    let refusal: unknown;
    const sentAt = Date.now();
    try {
      await engine.sendMessage(sessionKey, prompt, {
        ...sendOptions,
        signal: handoffStop.signal,
      });
      sent = true;
    } catch (e) {
      refusal = e;
    }
    const settledBehind =
      !sent &&
      isTurnRunningRejection(refusal) &&
      handoffStop.stopped() === undefined &&
      (await observerSettled(
        registry,
        key,
        prior,
        opts.tuning,
        handoffStop.signal,
      ));
    // A Stop wins even over a 202 that landed in its tick: the engine's
    // cancel stops the turn it took, and nothing settles before it answered.
    stoppedBeforeSend = handoffStop.stopped();
    if (stoppedBeforeSend) sent = false;
    handoffStop.disarm();
    if (sent) {
      if (registry.get(key) !== prior) firstResponse.dispose(); // torn down meanwhile
      prior.dispose();
      registry.delete(key);
    } else if (stoppedBeforeSend || computeBusyRefusal(refusal)) {
      // Stopped while out: the fresh path settles it once the engine's cancel
      // answered. Or no room on the shared compute, nothing ran: the fresh
      // path re-sends it, held, on the server's hint (`send-busy.ts`).
      if (!stoppedBeforeSend) {
        handoffRefusal = refusal;
        handoffSentAt = sentAt;
      }
      if (!registry.isSending(key)) {
        firstResponse.dispose(); // torn down while the send was out
        return;
      }
      // The observer must not keep streaming beside this turn.
      const current = registry.get(key);
      if (current?.kind === "observer") {
        current.dispose();
        registry.delete(key);
      }
    } else if (settledBehind) {
      // Held behind the observed turn until its observer settled (the bubble
      // stayed pending, the send lock held). Send on the fresh path below,
      // which holds again through the cloud pool's claim lag.
      if (!registry.isSending(key)) {
        // Torn down (logout) while held: the lock went with the streams, and
        // nobody is waiting any more. Never send into a gone client.
        firstResponse.dispose();
        return;
      }
      // A newer observer (the chat reopened mid-hold) must not keep
      // streaming beside this turn: every frame would render twice.
      const next = registry.get(key);
      if (next?.kind === "observer") {
        next.dispose();
        registry.delete(key);
      }
      after = prior.lastSeq;
    } else {
      const e = refusal;
      // The client tore the streams down while this send was out (the
      // observer is gone from the registry): nobody is waiting any more.
      if (registry.get(key) !== prior) firstResponse.dispose();
      registry.endSend(key);
      // The resend was rejected before it reached the engine — fail its
      // optimistic bubble (the observed turn keeps rendering unaffected).
      output.pushFeedItem(agentPath, sessionKey, refusedResendItem(e));
      firstResponse.resolve("error");
      return; // the observer keeps rendering the running turn
    }
  }

  const ac = new AbortController();
  // `dispose` is only ever called from outside (a client teardown, or a newer
  // turn replacing this one): stop the measurement at once, even while the
  // send below is still out, since its later verdict reaches nobody.
  const entry: ActiveStream = {
    kind: "turn",
    accepted: sent, // the handoff's send already landed
    dispose: () => {
      firstResponse.dispose();
      ac.abort();
    },
  };
  registry.set(key, entry);
  // The turn stream now owns the key — release the handoff send lock (a no-op
  // for the fresh path, which never claimed it).
  registry.endSend(key);
  // The observer may have settled the turn it watched while our send was
  // out: this turn runs from here (held, waiting, or accepted).
  if (prior?.kind === "observer")
    output.sessionStatus(agentPath, sessionKey, "running");

  const sink = new TurnSink({
    agentPath,
    sessionKey,
    output,
    mode: "turn",
    nonce,
    provider: opts.provider,
    prompt,
    stop: () => ac.abort(),
    reloadHistory: async () => (await engine.getHistory(sessionKey)).messages,
    // LEGACY fallback (no turn ids anywhere): trust history's trailing reply
    // only when the newest user message is THIS turn's prompt — known weak
    // against two identical prompts in a row; turnId matching replaces it.
    historyGuard: (messages) =>
      messages.filter((m) => m.role === "user").at(-1)?.content === prompt,
    // The grace before the pre-settled poll fires — a turn that finished before
    // our first sync (its frames never replayed) hangs the card without it.
    presettledPollMs: opts.tuning?.presettledPollMs ?? PRESETTLED_POLL_MS,
    firstResponse,
    board,
  });
  if (sent) sink.sendAccepted();
  // A teardown ends the sink at once: a history reload still out publishes
  // nothing while the rest of this turn unwinds.
  ac.signal.addEventListener("abort", () => sink.dispose(), { once: true });

  let sendVerdict: ReturnType<typeof setTimeout> | undefined;
  // A send the engine has not taken yet (still out, held behind a turn, or
  // waiting for room) has its own budget: the stream's failures meanwhile
  // never end the turn, and the stream's own budget starts once it is taken.
  let sendOut = !sent;
  let spentUnsent = 0;
  try {
    // A handoff stopped before the engine had it streams nothing: an idle
    // resync could settle it before the cancel answered.
    const streaming = stoppedBeforeSend
      ? Promise.resolve()
      : streamEventsResumable(engine, sessionKey, {
          signal: ac.signal,
          after,
          onEvent: (f) => {
            spentUnsent = 0; // a delivered frame zeroes the transport's count too
            if (typeof f.seq === "number") entry.lastSeq = f.seq;
            sink.onFrame(f);
          },
          onRetry: ({ consecutiveFailures, error }) => {
            if (sendOut) {
              spentUnsent = consecutiveFailures;
              return;
            }
            if (consecutiveFailures - spentUnsent < STREAM_FAILURE_BUDGET)
              return;
            // The engine has been unreachable for the whole budget: settle with
            // the engine's own verdict when the last attempt got one, else the
            // product copy. Never the raw transport error — a watchdog-aborted
            // hang rejects with WebKit's "Fetch is aborted", which is developer
            // speak, not a message (HOU-705).
            sink.fail(engineVerdictMessage(error) ?? STREAM_LOST_MESSAGE);
            ac.abort();
          },
          ...opts.tuning,
        });
    // Observe settlement even on the early-exit path (send rejected before
    // `await streaming`) so nothing becomes an unhandled rejection.
    streaming.catch(() => {});
    if (stoppedBeforeSend) {
      const stopped = stoppedBeforeSend;
      entry.held = true; // the queue watchdog flushes nothing into the cancel
      entry.stopUnsent = () => stopped.join(); // a second Stop joins the wait
      await stopped.settleWith(() => {
        if (!ac.signal.aborted) sink.fail(STOPPED_BY_USER); // not after a teardown
      });
      ac.abort();
    } else if (!sent) {
      try {
        const accepted = await sendUntilAccepted({
          send: (signal) =>
            engine.sendMessage(sessionKey, prompt, { ...sendOptions, signal }),
          sink,
          entry,
          ac,
          tuning: opts.tuning,
          output,
          agentPath,
          sessionKey,
          firstRefusal: handoffRefusal,
          firstSentAt: handoffSentAt,
        });
        sendOut = false;
        sink.sendAccepted(accepted.turnId);
      } catch (e) {
        sendOut = false;
        // A definitive failure (engine verdict / our abort) settles below.
        if (!isAmbiguousSendFailure(e)) throw e;
        // Transport failure — the engine may be running the turn regardless.
        // Keep the subscription as the arbiter: evidence of the turn settles
        // it normally; a verdict window with no evidence fails it as lost.
        sink.sendMaybeAccepted();
        sendVerdict = setTimeout(() => {
          if (sink.failUnlessStarted(SEND_LOST_MESSAGE)) ac.abort();
        }, opts.tuning?.sendVerdictMs ?? SEND_VERDICT_MS);
      }
    }
    await streaming; // resolves only once the sink settled and aborted
  } catch (e) {
    // A rejected send (e.g. the runtime refusing a not-connected turn with
    // 409), a fatal stream refusal (FatalResumeError), or a throwing frame
    // handler: settle with the engine's plain message so the spinner stops
    // and the reason surfaces. Every settle aborts after it, so an abort with
    // nothing settled is a teardown: a late refusal then settles nothing.
    if (!sink.settled && !ac.signal.aborted) settleRefusedSend(sink, e);
  } finally {
    if (sendVerdict !== undefined) clearTimeout(sendVerdict);
    sink.dispose(); // clear any armed pre-settled poll — the stream is done
    // A stream torn down without a settle (logout teardown) reports nothing.
    firstResponse.dispose();
    ac.abort();
    registry.release(key, entry);
  }

  // Persist the terminal board status once the turn settled — awaited, through
  // the cloud-aware seam, so the card actually leaves "running" on the surface
  // the board reads. The sink queued it the moment it settled (reply-phase.ts
  // `settleCard`). An externally disposed stream (logout teardown) settles
  // nothing and persists nothing: the client is gone.
  await board.settled;
}
