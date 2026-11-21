import type { initEngineSentry } from "@houston/runtime-client/sentry";
import { installParentWatchdog } from "../parent-watchdog";
import { isBenignRecursiveWatchRace } from "../watch/watcher-race";
import type { buildLocalHost } from "./host";

export function installProcessErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    if (isBenignRecursiveWatchRace(err)) {
      console.warn(
        "[local-host] transient fs-watch race (ignored):",
        err.message,
      );
      return;
    }
    console.error("[local-host] uncaughtException (staying up):", err);
  });
  process.on("unhandledRejection", (reason) => {
    if (isBenignRecursiveWatchRace(reason)) {
      console.warn(
        "[local-host] transient fs-watch race (ignored):",
        (reason as Error).message,
      );
      return;
    }
    console.error("[local-host] unhandledRejection (staying up):", reason);
  });
}

export function installShutdownHandlers(
  host: Pick<ReturnType<typeof buildLocalHost>, "stop">,
  sentry: ReturnType<typeof initEngineSentry>,
): void {
  let shuttingDown = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      if (shuttingDown) return process.exit(0);
      shuttingDown = true;
      void host
        .stop()
        .catch((err) => console.error("[local-host] shutdown failed:", err))
        .finally(async () => {
          await sentry?.flush(500);
          process.exit(0);
        });
    });
  }

  installParentWatchdog({ onParentExit: async () => await host.stop() });
}
