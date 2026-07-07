import type { HoustonEngineClient } from "@houston/runtime-client";
import { streamEventsResumable } from "@houston/runtime-client";
import type { FeedOutput } from "./feed-output";
import { randomNonce } from "./random-nonce";
import {
  type ActiveStream,
  SEND_IN_FLIGHT_MESSAGE,
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
  turnErrorMessage,
} from "./turn-errors";
import { TurnSink } from "./turn-sink";

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
  /** Per-turn execution mode ("plan" = read-only + planning overlay). Omitted
   *  runs the turn as "execute", the runtime's default for an unpinned turn. */
  mode?: "execute" | "plan";
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
  // Status BEFORE the bubble: `running: false` must mean settled-or-idle, so a
  // watcher can't mistake the optimistic-push snapshot for a settled turn.
  output.sessionStatus(agentPath, sessionKey, "running");
  // The optimistic user bubble: the surface never renders it itself, and the
  // sink never renders the server's echo of it (nonce-matched) — this push is
  // the ONE place a sent prompt enters the feed. Marker-tagged prompts
  // (auto-continue) are filtered at render, same as their persisted copies.
  if (!opts.suppressUserBubble) {
    output.pushFeedItem(agentPath, sessionKey, {
      feed_type: "user_message",
      data: prompt,
    });
  }
  // Flip the card to "running" for this turn (re-running a needs_you/done
  // activity must reset it) and CLEAR any interaction the prior settle stored
  // (null) — a re-run is no longer waiting on the user. Fire concurrently so it
  // never delays turn start; persistBoardStatus surfaces its own failure.
  void output.persistBoardStatus(agentPath, sessionKey, "running", null);

  const key = streamKey(agentPath, sessionKey);
  const nonce = opts.nonce ?? randomNonce();
  const prior = registry.get(key);
  // A previous turn's stream must be disposed (aborted), never silently
  // overwritten — two live turn subscriptions would render frames twice.
  if (prior?.kind === "turn") {
    prior.dispose();
    registry.delete(key);
  }

  // Observer→turn handoff. The cursor snapshot happens BEFORE the send so the
  // resumed stream replays everything from that point — our `user` echo (the
  // turnId source) included, even if the observer consumed it before disposal.
  let after: number | undefined;
  let sent = false;
  if (prior?.kind === "observer") {
    // Claim the per-key send lock SYNCHRONOUSLY, before the first await: the
    // observer entry still holds the key across `sendMessage`, so without this a
    // second concurrent streamTurn would also see the observer as prior and fire
    // a second real send + attach a second sink (double render). The loser fails
    // fast; the observer keeps rendering the running turn.
    if (!registry.beginSend(key)) {
      output.pushFeedItem(agentPath, sessionKey, {
        feed_type: "system_message",
        data: SEND_IN_FLIGHT_MESSAGE,
      });
      return;
    }
    after = prior.lastSeq;
    try {
      await engine.sendMessage(sessionKey, prompt, { nonce, ...opts.pin });
    } catch (e) {
      registry.endSend(key);
      output.pushFeedItem(agentPath, sessionKey, {
        feed_type: "system_message",
        data: turnErrorMessage(e),
      });
      return; // the observer keeps rendering the running turn
    }
    sent = true;
    prior.dispose();
    registry.delete(key);
  }

  const ac = new AbortController();
  const entry: ActiveStream = { kind: "turn", dispose: () => ac.abort() };
  registry.set(key, entry);
  // The turn stream now owns the key — release the handoff send lock (a no-op
  // for the fresh path, which never claimed it).
  registry.endSend(key);

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
  });
  if (sent) sink.sendAccepted();

  let sendVerdict: ReturnType<typeof setTimeout> | undefined;
  try {
    const streaming = streamEventsResumable(engine, sessionKey, {
      signal: ac.signal,
      after,
      onEvent: (f) => {
        if (typeof f.seq === "number") entry.lastSeq = f.seq;
        sink.onFrame(f);
      },
      onRetry: ({ consecutiveFailures, error }) => {
        if (consecutiveFailures < STREAM_FAILURE_BUDGET) return;
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
    if (!sent) {
      try {
        await engine.sendMessage(sessionKey, prompt, { nonce, ...opts.pin });
        sink.sendAccepted();
      } catch (e) {
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
    // and the reason surfaces.
    if (!sink.settled) sink.fail(turnErrorMessage(e));
  } finally {
    if (sendVerdict !== undefined) clearTimeout(sendVerdict);
    ac.abort();
    registry.release(key, entry);
  }

  // Persist the terminal board status once the turn settled — awaited, through
  // the cloud-aware seam, so the card actually leaves "running" on the surface
  // the board reads. An externally disposed stream (logout teardown) settles
  // nothing and persists nothing: the client is gone.
  if (sink.terminal)
    await output.persistBoardStatus(
      agentPath,
      sessionKey,
      sink.terminal,
      sink.terminalInteraction,
    );
}
