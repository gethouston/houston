import type { SendAccepted } from "@houston/runtime-client";
import { computeBusyRefusal, SendBusyClock } from "./send-busy";
import { SendHoldClock } from "./send-hold-clock";
import {
  type ActiveStream,
  SEND_TURN_RUNNING_RETRY_DELAYS_MS,
  SEND_WAKE_RETRY_DELAYS_MS,
  type StreamRegistry,
  type StreamTuning,
} from "./stream-registry";
import { isEngineWakingRejection } from "./turn-errors";
import { isTurnRunningRejection } from "./turn-running";

/**
 * Re-sending a message the engine refused as "not now". Three refusals are
 * transient and never lose the message: the pod is waking (a restart, a
 * boot), another turn still holds the conversation (`409 turn running`), or
 * the cloud's shared compute has no room yet (`503 compute_busy`,
 * `send-busy.ts`). Every re-send carries the SAME request (same nonce), so a
 * late acceptance can never double the message, and the bubble stays pending
 * throughout.
 */

/** Where a held send learns the running turn ended (see `TurnSink`). */
export interface TurnEndEvidence {
  /** A counter that grows each time the stream shows a turn end. */
  readonly turnEnds: number;
  /** Latest live agent frame or running sync, never a 409 refusal. */
  readonly lastProgressAt?: number;
  /** Resolves once `turnEnds` exceeds `mark`, or `signal` aborts. */
  turnEndAfter(mark: number, signal: AbortSignal): Promise<void>;
}

/** What a holding send reports back, and what it starts from. */
export interface SendHoldHooks {
  /** The send is held: frames meanwhile are another turn's. */
  onHold: () => void;
  /** A busy wait grew long enough for the person to be told. */
  onBusy?: () => void;
  /** A refusal an earlier send of this message already met (the observer
   *  handoff's), handled before the first re-send. */
  firstRefusal?: unknown;
  /** When that earlier send went out: the busy budget and notice count from
   *  then, not from its refusal (which can follow the gateway's queue). */
  busySince?: number;
}

/** Wait `ms`, waking early on abort. */
export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/** How long a `turn running` refusal waits before re-send `attempt`. */
export function turnRunningDelay(
  tuning: StreamTuning | undefined,
  attempt: number,
): number {
  const delays =
    tuning?.sendTurnRunningRetryDelaysMs ?? SEND_TURN_RUNNING_RETRY_DELAYS_MS;
  return delays[Math.min(attempt, delays.length - 1)] ?? 0;
}

/**
 * Send, and re-send while the refusal is transient. A busy refusal re-sends
 * after the server's hint until the busy budget runs out, and once the wait
 * grows long `onBusy` fires so the turn can say so. A waking refusal walks
 * the wake ladder; a `turn running` refusal is HELD: `onHold` fires, then the
 * re-send goes out as soon as the stream shows a turn end (the running turn's
 * terminal frame) or the fallback delay elapses, whichever comes first. The
 * fallback matters on the cloud pool, where the claim frees a beat AFTER the
 * terminal frame, so the first evidence-driven re-send can meet one more 409.
 * Any other refusal, an exhausted ladder or budget, or the caller's abort
 * rejects with the last refusal. The first send goes out synchronously, so
 * the accepted-first-time path keeps its exact timing.
 */
export async function sendHolding(
  /** An engine answering nothing on acceptance names no turn. */
  send: () => Promise<SendAccepted | undefined>,
  evidence: TurnEndEvidence,
  signal: AbortSignal,
  tuning: StreamTuning | undefined,
  hooks: SendHoldHooks,
): Promise<SendAccepted> {
  const { onHold, onBusy = () => {} } = hooks;
  // A refusal the first send already met is handled before anything is sent.
  let carried = hooks.firstRefusal;
  const wakeDelays = tuning?.sendWakeRetryDelaysMs ?? SEND_WAKE_RETRY_DELAYS_MS;
  const busyClock = new SendBusyClock(tuning, hooks.busySince);
  let wakes = 0;
  let holds = 0;
  let holdClock: SendHoldClock | undefined;
  try {
    for (;;) {
      const mark = evidence.turnEnds;
      let refusal: unknown = carried;
      carried = undefined;
      if (refusal === undefined) {
        try {
          return (await send()) ?? {};
        } catch (e) {
          refusal = e;
        }
      }
      if (signal.aborted) throw refusal;
      // Before the waking check: a busy refusal carries the waking error string
      // too, so a client from before the code still re-sends it.
      const busy = computeBusyRefusal(refusal);
      if (busy) {
        if (busyClock.spent) throw refusal;
        // Held, like a send behind a running turn: the stream's frames are not
        // this turn's until it is accepted, so an idle sync cannot settle it.
        onHold();
        busyClock.armNotice(onBusy);
        const left = busyClock.left;
        const wait = busyClock.pauseFor(busy);
        await pause(wait, signal);
        // A pause cut to the budget's end is the last one, whatever the
        // timer's jitter: no re-send follows it.
        if (wait >= left || busyClock.spent) throw refusal;
      } else if (isEngineWakingRejection(refusal)) {
        const delay = wakeDelays[wakes++];
        if (delay === undefined) throw refusal;
        await pause(delay, signal);
      } else if (isTurnRunningRejection(refusal)) {
        holdClock ??= new SendHoldClock(tuning);
        const left = holdClock.left(evidence.lastProgressAt);
        if (left <= 0) throw refusal;
        onHold();
        const ac = new AbortController();
        const stop = () => ac.abort();
        signal.addEventListener("abort", stop, { once: true });
        await Promise.race([
          pause(Math.min(left, turnRunningDelay(tuning, holds++)), ac.signal),
          evidence.turnEndAfter(mark, ac.signal),
        ]);
        ac.abort();
        signal.removeEventListener("abort", stop);
      } else throw refusal;
      if (signal.aborted) throw refusal;
    }
  } finally {
    busyClock.dispose();
  }
}

/**
 * A send handed off over a live observer met `turn running`: wait for the
 * observed turn's observer to settle and leave the registry. False when it
 * outlived the whole hold budget (the send then settles as refused).
 */
export async function observerSettled(
  registry: StreamRegistry,
  key: string,
  observer: ActiveStream,
  tuning: StreamTuning | undefined,
  /** The person's Stop of the held send: ends the wait early. */
  stop?: AbortSignal,
): Promise<boolean> {
  const ac = new AbortController();
  const end = () => ac.abort();
  stop?.addEventListener("abort", end, { once: true });
  if (stop?.aborted) ac.abort();
  const clock = new SendHoldClock(tuning);
  while (!ac.signal.aborted && registry.get(key) === observer) {
    const left = clock.left(observer.lastProgressAt);
    if (left <= 0) break;
    const wait = new AbortController();
    const endWait = () => wait.abort();
    ac.signal.addEventListener("abort", endWait, { once: true });
    await Promise.race([
      registry.left(key, observer, wait.signal),
      pause(left, wait.signal),
    ]);
    wait.abort();
    ac.signal.removeEventListener("abort", endWait);
  }
  ac.abort();
  stop?.removeEventListener("abort", end);
  return registry.get(key) !== observer;
}
