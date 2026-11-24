import { HydrateLimitError } from "@houston/runtime-client/object-sync";
import type { DeferredGate } from "./turn-deferred-gate";
import { turnHydrationError } from "./turn-hydration-error";

/** Why the deferred set stopped when the prompt no longer needed it. */
export class DeferredFilesAbandonedError extends Error {
  constructor() {
    super("the turn ended before its files were needed");
    this.name = "DeferredFilesAbandonedError";
  }
}

/** Store reads of the deferred set, each bounded (read-timeout.ts). */
export const DEFERRED_READ_TIMEOUT_MS = 120_000;
/** Deferred reads in flight at once: the critical set's batch parallelism
 *  (hydrate-batch.ts), so up to four batch bodies are buffered beside the
 *  harness, as the critical path already buffers while a send's harness
 *  starts. A large agent's bulk (git clones, toolchains, documents) lands
 *  here, and shell tools wait for all of it (turn-deferred-tools.ts); at
 *  half that pace, a turn's first shell call would wait longer than the
 *  whole tree used to take before the prompt. */
export const DEFERRED_PARALLEL = 4;

export function watchDeferredFiles(
  deferred: Promise<void>,
  abort: (reason: unknown) => void,
  timings?: Record<string, number>,
  gate?: {
    gate: DeferredGate;
    started: Parameters<DeferredGate["observe"]>[1];
  },
): {
  workspaceReady: Promise<void>;
  abandonDeferred: () => void;
  deferredGate?: DeferredGate;
} {
  let landed = false;
  let abandoned = false;
  const workspaceReady = deferred.then(
    () => {
      landed = true;
      if (timings) timings.t_files_ready = performance.now();
    },
    (error: unknown) => {
      if (error instanceof DeferredFilesAbandonedError) {
        if (timings) timings.t_files_abandoned = performance.now();
        throw error;
      }
      if (timings) timings.t_deferred_failed = performance.now();
      if (error instanceof HydrateLimitError) {
        // The person's files outgrew the budget: true on every send until
        // they shrink, so it is logged with its size, not reported as a fault.
        console.info(
          `[turn] deferred_files_over_budget listed=${error.observedBytes} max=${error.maxBytes}`,
        );
      } else {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[turn] deferred_files_failed cause=${detail}`);
      }
      throw turnHydrationError(error);
    },
  );
  gate?.gate.observe(workspaceReady, gate.started);
  return {
    workspaceReady,
    ...(gate ? { deferredGate: gate.gate } : {}),
    abandonDeferred() {
      if (landed || abandoned) return;
      abandoned = true;
      abort(new DeferredFilesAbandonedError());
    },
  };
}
