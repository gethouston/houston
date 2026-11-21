import type { ProviderError, WireEvent } from "@houston/runtime-client";
import { unansweredWindows } from "../ai/first-byte";
import type { HarnessSession } from "../backends/types";
import { describeStall, stallFailure } from "../session/stall-failure";
import {
  createStallWatchdog,
  type StallReason,
} from "../session/stall-watchdog";

export interface TurnStallGuard {
  admit(event: WireEvent): boolean;
  arm(): void;
  disarm(): void;
  stalled(): boolean;
  failure(provider: string): ProviderError;
}

export function guardTurnStall(input: {
  session: HarnessSession;
  timeoutMs: number;
  firstByteDeadlineMs: number;
  conversationId: string;
  turnId: string;
}): TurnStallGuard {
  let trip: { reason: StallReason; windowMs: number } | undefined;
  const watchdog = createStallWatchdog({
    timeoutMs: input.timeoutMs,
    firstResponseMs: unansweredWindows(input.firstByteDeadlineMs),
    onStall: (reason, windowMs) => {
      trip = { reason, windowMs };
      console.warn(
        `[turn] stall watchdog aborted the turn: ${describeStall(reason, windowMs)} (conversation=${input.conversationId} turn=${input.turnId})`,
      );
      void input.session.abort();
    },
  });
  const unsubLiveness = input.session.subscribeLiveness?.(() =>
    watchdog.touch(),
  );
  const unsubPhase = input.session.subscribeModelPhase?.((phase) =>
    watchdog.onPhase(phase),
  );
  const unsubResponse = input.session.subscribeAssistantMessageStart?.(() =>
    watchdog.onResponseStart(),
  );
  return {
    admit(event) {
      if (trip && event.type === "provider_error") return false;
      watchdog.onEvent(event);
      return true;
    },
    arm: () => watchdog.arm(),
    disarm() {
      watchdog.disarm();
      unsubLiveness?.();
      unsubPhase?.();
      unsubResponse?.();
    },
    stalled: () => trip !== undefined,
    failure: (provider) =>
      stallFailure(
        trip?.reason ?? "silent",
        trip?.windowMs ?? input.timeoutMs,
        provider,
      ),
  };
}
