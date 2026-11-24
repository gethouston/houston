import { classifyQuietError } from "./quiet-error-class.ts";

export interface SendPinSignals {
  agentConfigSettled: boolean;
  activitySettled: boolean;
  capabilitiesSettled: boolean;
  choiceSettled: boolean;
  statusesSettled: boolean;
}

export function sendPinSettled(signals: SendPinSignals): boolean {
  return (
    signals.agentConfigSettled &&
    signals.activitySettled &&
    signals.capabilitiesSettled &&
    signals.choiceSettled &&
    signals.statusesSettled
  );
}

export const SEND_PIN_SETTLE_TIMEOUT_MS = 15_000;

export interface SendPinGate<T> {
  update(value: T, settled: boolean): void;
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

const PIN_INPUTS: readonly (keyof SendPinSignals)[] = [
  "agentConfigSettled",
  "activitySettled",
  "capabilitiesSettled",
  "choiceSettled",
  "statusesSettled",
];

export function unsettledPinInputs(signals: SendPinSignals): string[] {
  return PIN_INPUTS.filter((key) => !signals[key]).map((key) =>
    key.replace(/Settled$/, ""),
  );
}

export type PinInputFailures = Partial<Record<keyof SendPinSignals, unknown>>;

export function pinStallQuietClass(
  signals: SendPinSignals,
  input: {
    online: boolean;
    engineWarming: boolean;
    failures: PinInputFailures;
  },
): "offline" | "engine_waking" | null {
  if (!input.online) return "offline";
  for (const key of PIN_INPUTS) {
    if (signals[key]) continue;
    const quiet = classifyQuietError(input.failures[key]);
    if (quiet === "offline" || quiet === "engine_waking") return quiet;
  }
  return input.engineWarming ? "engine_waking" : null;
}
