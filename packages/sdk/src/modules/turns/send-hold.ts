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

export interface TurnEndEvidence {
  readonly turnEnds: number;
  readonly lastProgressAt?: number;
  turnEndAfter(mark: number, signal: AbortSignal): Promise<void>;
}

export interface SendHoldHooks {
  onHold: () => void;
  onBusy?: () => void;
  firstRefusal?: unknown;
  busySince?: number;
}

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

export function turnRunningDelay(
  tuning: StreamTuning | undefined,
  attempt: number,
): number {
  const delays =
    tuning?.sendTurnRunningRetryDelaysMs ?? SEND_TURN_RUNNING_RETRY_DELAYS_MS;
  return delays[Math.min(attempt, delays.length - 1)] ?? 0;
}

export async function sendHolding(
  send: () => Promise<SendAccepted | undefined>,
  evidence: TurnEndEvidence,
  signal: AbortSignal,
  tuning: StreamTuning | undefined,
  hooks: SendHoldHooks,
): Promise<SendAccepted> {
  const { onHold, onBusy = () => {} } = hooks;
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
      const busy = computeBusyRefusal(refusal);
      if (busy) {
        if (busyClock.spent) throw refusal;
        onHold();
        busyClock.armNotice(onBusy);
        const left = busyClock.left;
        const wait = busyClock.pauseFor(busy);
        await pause(wait, signal);
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

export async function observerSettled(
  registry: StreamRegistry,
  key: string,
  observer: ActiveStream,
  tuning: StreamTuning | undefined,
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
