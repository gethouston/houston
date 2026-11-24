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
 * settings; omitted fields fall back to the runtime's resolution.
 */
export interface TurnWirePin {
  provider?: string;
  model?: string;
  effort?: string;
  /** Per-turn execution mode ("plan" = read-only + planning overlay; "auto" =
   *  Autopilot, acts without the blocking tools). Omitted runs the turn on the
   *  mode its conversation keeps (the mission card's `mode`), else "execute". */
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
   * The teammates this turn @mentions: the structured sidecar the
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
  /**
   * Called once, the moment the engine accepts this send (its 202, or the
   * turn seen running after an ambiguous transport failure). Never called for
   * a refused, stopped or lost send, so what the send carried stays the
   * caller's to give back.
   */
  onAccepted?: () => void;
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
 * lands anyway. So the ambiguous path settles nothing: the already-
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
  const firstResponse = new FirstResponseClock(
    (response) => output.firstResponse?.(agentPath, sessionKey, response),
    opts.tuning?.firstResponseTimeoutMs,
  );
  const key = registry.noteTurnStart(streamKey(agentPath, sessionKey));
  output.sessionStatus(agentPath, sessionKey, "running");
  const mentions = opts.mentions?.length ? opts.mentions : undefined;
  if (!opts.suppressUserBubble && !isAutoContinue(prompt)) {
    output.pushFeedItem(agentPath, sessionKey, {
      feed_type: "user_message",
      data: opts.displayText ?? prompt,
      pending: true,
      author: opts.author,
      mentions,
    });
  }
  const board = new TurnBoardWrites(output, agentPath, sessionKey);
  void board.persist("running", null, { stamp: "last_message" });

  const nonce = opts.nonce ?? randomNonce();
  const prior = registry.get(key);
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
  let after: number | undefined;
  let sent = false;
  let handoffRefusal: unknown;
  let handoffSentAt: number | undefined;
  let stoppedBeforeSend: PersonStop | undefined;
  const refuseDuplicate = () => {
    output.pushFeedItem(agentPath, sessionKey, duplicateSendItem);
    firstResponse.resolve("error");
  };
  if (prior?.kind !== "observer" && registry.isSending(key)) {
    refuseDuplicate();
    return;
  }
  if (prior?.kind === "observer") {
    if (!registry.beginSend(key)) {
      refuseDuplicate();
      return;
    }
    after = prior.lastSeq;
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
    stoppedBeforeSend = handoffStop.stopped();
    if (stoppedBeforeSend) sent = false;
    handoffStop.disarm();
    if (sent) {
      if (registry.get(key) !== prior) firstResponse.dispose();
      prior.dispose();
      registry.delete(key);
    } else if (stoppedBeforeSend || computeBusyRefusal(refusal)) {
      if (!stoppedBeforeSend) {
        handoffRefusal = refusal;
        handoffSentAt = sentAt;
      }
      if (!registry.isSending(key)) {
        firstResponse.dispose();
        return;
      }
      const current = registry.get(key);
      if (current?.kind === "observer") {
        current.dispose();
        registry.delete(key);
      }
    } else if (settledBehind) {
      if (!registry.isSending(key)) {
        firstResponse.dispose();
        return;
      }
      const next = registry.get(key);
      if (next?.kind === "observer") {
        next.dispose();
        registry.delete(key);
      }
      after = prior.lastSeq;
    } else {
      const e = refusal;
      if (registry.get(key) !== prior) firstResponse.dispose();
      registry.endSend(key);
      output.pushFeedItem(agentPath, sessionKey, refusedResendItem(e));
      firstResponse.resolve("error");
      return;
    }
  }

  const ac = new AbortController();
  const entry: ActiveStream = {
    kind: "turn",
    accepted: sent,
    dispose: () => {
      firstResponse.dispose();
      ac.abort();
    },
  };
  registry.set(key, entry);
  registry.endSend(key);
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
    historyGuard: (messages) =>
      messages.filter((m) => m.role === "user").at(-1)?.content === prompt,
    presettledPollMs: opts.tuning?.presettledPollMs ?? PRESETTLED_POLL_MS,
    firstResponse,
    board,
  });
  let acceptedOnce = false;
  const noteAccepted = () => {
    if (acceptedOnce) return;
    acceptedOnce = true;
    opts.onAccepted?.();
  };
  if (sent) {
    sink.sendAccepted();
    noteAccepted();
  }
  sink.whenStarted(noteAccepted);
  ac.signal.addEventListener("abort", () => sink.dispose(), { once: true });

  let sendVerdict: ReturnType<typeof setTimeout> | undefined;
  let sendOut = !sent;
  let spentUnsent = 0;
  try {
    const streaming = stoppedBeforeSend
      ? Promise.resolve()
      : streamEventsResumable(engine, sessionKey, {
          signal: ac.signal,
          after,
          onEvent: (f) => {
            spentUnsent = 0;
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
            sink.fail(engineVerdictMessage(error) ?? STREAM_LOST_MESSAGE);
            ac.abort();
          },
          ...opts.tuning,
        });
    streaming.catch(() => {});
    if (stoppedBeforeSend) {
      const stopped = stoppedBeforeSend;
      entry.held = true;
      entry.stopUnsent = () => stopped.join();
      await stopped.settleWith(() => {
        if (!ac.signal.aborted) sink.fail(STOPPED_BY_USER);
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
        noteAccepted();
      } catch (e) {
        sendOut = false;
        if (!isAmbiguousSendFailure(e)) throw e;
        sink.sendMaybeAccepted();
        sendVerdict = setTimeout(() => {
          if (sink.failUnlessStarted(SEND_LOST_MESSAGE)) ac.abort();
        }, opts.tuning?.sendVerdictMs ?? SEND_VERDICT_MS);
      }
    }
    await streaming;
  } catch (e) {
    if (!sink.settled && !ac.signal.aborted) settleRefusedSend(sink, e);
  } finally {
    if (sendVerdict !== undefined) clearTimeout(sendVerdict);
    sink.dispose();
    firstResponse.dispose();
    ac.abort();
    registry.release(key, entry);
  }

  await board.settled;
}
