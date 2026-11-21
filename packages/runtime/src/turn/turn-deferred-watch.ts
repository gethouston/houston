import { HydrateLimitError } from "@houston/runtime-client/object-sync";
import { turnHydrationError } from "./turn-hydration-error";

export class DeferredFilesAbandonedError extends Error {
  constructor() {
    super("the turn ended before its files were needed");
    this.name = "DeferredFilesAbandonedError";
  }
}

export const DEFERRED_READ_TIMEOUT_MS = 120_000;
export const DEFERRED_PARALLEL = 4;

export function watchDeferredFiles(
  deferred: Promise<void>,
  abort: (reason: unknown) => void,
  timings?: Record<string, number>,
): { workspaceReady: Promise<void>; abandonDeferred: () => void } {
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
  return {
    workspaceReady,
    abandonDeferred() {
      if (landed || abandoned) return;
      abandoned = true;
      abort(new DeferredFilesAbandonedError());
    },
  };
}
