import type { WireFrame } from "@houston/runtime-client";
import { TURN_DIED_MESSAGE } from "./relay-dialect";

export interface PumpTurnOptions {
  run: (
    publish: (e: WireFrame) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>;
  publish: (e: WireFrame) => Promise<void>;
  signal: AbortSignal;
  runningTurnId: () => string | undefined;
  stillRunning: () => boolean;
  release: () => Promise<void>;
}

export function pumpTurn(opts: PumpTurnOptions): void {
  const { run, publish, signal, runningTurnId, stillRunning, release } = opts;
  void run(publish, signal)
    .catch(async (err) => {
      const message = signal.aborted
        ? "Stopped by user"
        : err instanceof Error
          ? err.message
          : String(err);
      await publish({
        type: "error",
        data: { message },
        turnId: runningTurnId(),
      });
    })
    .finally(async () => {
      try {
        if (stillRunning()) {
          await publish({
            type: "error",
            data: { message: TURN_DIED_MESSAGE },
            turnId: runningTurnId(),
          });
        }
      } finally {
        await release();
      }
    });
}
