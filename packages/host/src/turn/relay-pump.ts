import type { WireFrame } from "@houston/runtime-client";
import { TURN_DIED_MESSAGE } from "./relay-dialect";

export interface PumpTurnOptions {
  run: (
    publish: (e: WireFrame) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>;
  publish: (e: WireFrame) => Promise<void>;
  signal: AbortSignal;
  /** The id of the turn the owned stream is running; absent when the pump
   *  died before its first frame. */
  runningTurnId: () => string | undefined;
  /** Whether the owned stream's snapshot still reads `running`. */
  stillRunning: () => boolean;
  /** Frees the slot and the stream once the pump has settled. */
  release: () => Promise<void>;
}

/**
 * Run one turn's pump in the background. A throw from `run` is published as
 * an error frame — an abort reads as a user stop. A pump that ends with the
 * stream still running (upstream died without a terminal frame) gets a
 * synthesized TURN_DIED error, so no client hangs on a turn that no longer
 * exists. Terminal frames carry the id of the turn they terminate.
 */
export function pumpTurn(opts: PumpTurnOptions): void {
  const { run, publish, signal, runningTurnId, stillRunning, release } = opts;
  void run(publish, signal)
    .catch(async (err) => {
      // Same verbatim string the runtime emits on a user stop, so the web
      // adapter renders both as a neutral "you stopped it" (not a red error).
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
