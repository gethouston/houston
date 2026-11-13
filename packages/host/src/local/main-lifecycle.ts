import type { initEngineSentry } from "@houston/runtime-client/sentry";
import { installParentWatchdog } from "../parent-watchdog";
import { isBenignRecursiveWatchRace } from "../watch/watcher-race";
import type { buildLocalHost } from "./host";

export function installProcessErrorHandlers(): void {
  // A desktop supervisor must not die on a stray error from a child runtime, a
  // dropped SSE socket, or a transient fetch. Log loudly and stay up — the user
  // would otherwise see "NetworkError" on the next request.
  process.on("uncaughtException", (err) => {
    // One narrow demotion: Node's Linux recursive-watcher ENOENT race on a
    // transient dir (see watch/watcher-race.ts). Warning breadcrumb, not a
    // Sentry error event; every other uncaught error stays loud.
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
    // Same benign-race demotion as above: Node's promise-based watcher
    // internals can surface the ENOENT as a rejection instead of a throw.
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
          // Deliver anything still queued (e.g. a shutdown-failure event). A
          // clean stop has an empty queue and this resolves immediately.
          await sentry?.flush(500);
          process.exit(0);
        });
    });
  }

  // Unix orphan-prevention: when the Tauri app is FORCE-QUIT or crashes it sends
  // no signal, but the OS closes the write-end of our piped stdin. Watch for that
  // EOF and tear down (killing every runtime) so a hard app exit never orphans the
  // host + its runtimes. Arms ONLY when the supervisor set `HOUSTON_SUPERVISED=1`
  // (its default signal); self-host Docker, plain `tsx`, and tests leave it
  // unset and stay inert. Windows force-quit is covered by the supervisor's
  // kill-on-close Job Object.
  installParentWatchdog({ onParentExit: async () => await host.stop() });
}
