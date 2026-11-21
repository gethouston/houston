import type { AnalyticsListener } from "./analytics-bus.ts";

export const FIRST_MESSAGE_SENT_KEY = "first_message_sent";

export type FirstMessageState = "unarmed" | "armed" | "sent";

export const FIRST_MESSAGE_ARMED_VALUE = "armed";
export const FIRST_MESSAGE_SENT_VALUE = "1";

export function parseFirstMessageState(raw: string | null): FirstMessageState {
  const value = raw?.trim();
  if (value === FIRST_MESSAGE_ARMED_VALUE) return "armed";
  if (value === FIRST_MESSAGE_SENT_VALUE) return "sent";
  return "unarmed";
}

export function shouldArmFirstMessage(state: FirstMessageState): boolean {
  return state === "unarmed";
}

export async function armFirstMessage(deps: {
  readState: () => Promise<FirstMessageState>;
  writeArmed: () => Promise<void>;
}): Promise<void> {
  if (shouldArmFirstMessage(await deps.readState())) await deps.writeArmed();
}

export interface FirstMessageTrackerDeps {
  readState: () => Promise<FirstMessageState>;
  writeSent: () => Promise<void>;
  track: () => void;
  onError: (command: string, err: unknown) => void;
}

export interface FirstMessageTracker {
  listener: AnalyticsListener;
  dispose: () => void;
}

export function createFirstMessageTracker(
  deps: FirstMessageTrackerDeps,
): FirstMessageTracker {
  let latched = false;
  let disposed = false;
  const listener: AnalyticsListener = (name) => {
    if (name !== "chat_message_sent" || latched || disposed) return;
    latched = true;
    deps.readState().then(
      (state) => {
        if (disposed || state !== "armed") return;
        deps.track();
        deps.writeSent().catch((err: unknown) => {
          deps.onError("first_message_sent_write", err);
        });
      },
      (err: unknown) => {
        latched = false;
        if (!disposed) deps.onError("first_message_sent_read", err);
      },
    );
  };
  return {
    listener,
    dispose: () => {
      disposed = true;
    },
  };
}
