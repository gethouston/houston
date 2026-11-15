/**
 * The composer's provider/model pin is assembled from several async reads
 * (the mission row, the agent config, the deployment capabilities, the acting
 * user's stored choice, the provider probe). Until every one of them has landed
 * the resolution is a GUESS that bottoms out on the device-wide last-used
 * provider — and a send fired in that window carried the guess as the turn's
 * pin, which the gateway passes through and the runtime treats as an explicit
 * pick (PRODUCT-1771: a Claude chat ran on a local model picked the day before
 * in another space, while the picker had already settled on Claude).
 *
 * Two pure pieces, so the rule is testable without React:
 *  - `sendPinSettled` — whether every input the resolution reads has settled;
 *  - `createSendPinGate` — hands a send the LATEST pin only once settled,
 *    bounded by a timeout so a read that never answers cannot hold a message
 *    hostage (the pin it then gets is the best the composer has, and the turn
 *    surfaces its own error card if that is wrong).
 */

import { classifyQuietError } from "./quiet-error-class.ts";

export interface SendPinSignals {
  /** The agent's config read has answered (success or failure). */
  agentConfigSettled: boolean;
  /**
   * The open conversation's row is the agent's REAL list, not the pin-less
   * placeholder seeded from the cross-agent cache (`latestCachedAgentActivities`).
   * True with no conversation open.
   */
  activitySettled: boolean;
  /** The deployment described itself (the personal/shared picker decision). */
  capabilitiesSettled: boolean;
  /** The acting user's stored choice was read, when the picker is personal. */
  choiceSettled: boolean;
  /** The provider probe answered (a fresh chat auth-gates on it). */
  statusesSettled: boolean;
}

/** Whether a send may trust the composer's current pin. */
export function sendPinSettled(signals: SendPinSignals): boolean {
  return (
    signals.agentConfigSettled &&
    signals.activitySettled &&
    signals.capabilitiesSettled &&
    signals.choiceSettled &&
    signals.statusesSettled
  );
}

/** How long a send waits for the pin before going out with the best guess. */
export const SEND_PIN_SETTLE_TIMEOUT_MS = 15_000;

export interface SendPinGate<T> {
  /** Record the composer's latest pin and whether its inputs have settled. */
  update(value: T, settled: boolean): void;
  /**
   * The pin a send should carry: the latest value once settled, else the value
   * current when the wait ends — on settle, or on the timeout.
   */
  resolve(timeoutMs?: number): Promise<T>;
}

export function createSendPinGate<T>(
  initial: T,
  onTimeout?: () => void,
  setTimer: (
    cb: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout> = setTimeout,
  clearTimer: (id: ReturnType<typeof setTimeout>) => void = clearTimeout,
): SendPinGate<T> {
  let latest = initial;
  let settled = false;
  let waiters: (() => void)[] = [];

  const flush = () => {
    const pending = waiters;
    waiters = [];
    for (const wake of pending) wake();
  };

  return {
    update(value, isSettled) {
      latest = value;
      settled = isSettled;
      if (settled) flush();
    },
    resolve(timeoutMs = SEND_PIN_SETTLE_TIMEOUT_MS) {
      if (settled) return Promise.resolve(latest);
      return new Promise<T>((done) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const wake = () => {
          if (timer !== undefined) clearTimer(timer);
          done(latest);
        };
        waiters.push(wake);
        timer = setTimer(() => {
          waiters = waiters.filter((w) => w !== wake);
          onTimeout?.();
          done(latest);
        }, timeoutMs);
      });
    },
  };
}

/** Every input the gate waits on, in report order. */
const PIN_INPUTS: readonly (keyof SendPinSignals)[] = [
  "agentConfigSettled",
  "activitySettled",
  "capabilitiesSettled",
  "choiceSettled",
  "statusesSettled",
];

/**
 * The inputs still unsettled when a send gave up waiting, by the short name a
 * report carries (`agentConfig`, `statuses`...). Sentry groups the stall by
 * this list, so each cause is its own issue (HOUSTON-APP-5EX).
 */
export function unsettledPinInputs(signals: SendPinSignals): string[] {
  return PIN_INPUTS.filter((key) => !signals[key]).map((key) =>
    key.replace(/Settled$/, ""),
  );
}

/**
 * Whether a stall is the environment, not a bug: the device offline, or the
 * agent's engine waking (its warm-up is tracked, or a read the gate waits on
 * last failed with a waking or transport answer). Such a stall reports as the
 * quiet class; any other stall is a real report.
 */
export function pinStallQuietClass(input: {
  online: boolean;
  engineWarming: boolean;
  failures: readonly unknown[];
}): "offline" | "engine_waking" | null {
  if (!input.online) return "offline";
  for (const failure of input.failures) {
    const quiet = classifyQuietError(failure);
    if (quiet === "offline" || quiet === "engine_waking") return quiet;
  }
  return input.engineWarming ? "engine_waking" : null;
}
