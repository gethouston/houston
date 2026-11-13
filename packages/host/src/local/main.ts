import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  initEngineSentry,
  installConsoleCapture,
} from "@houston/runtime-client/sentry";

import { installParentWatchdog } from "../parent-watchdog";
import { isBenignRecursiveWatchRace } from "../watch/watcher-race";
import { buildMainHost } from "./main-host";
import { managedStoreConfig } from "./managed-store-config";

/** Desktop sidecar and self-host entry. HOUSTON_HOME defaults to ~/.houston;
 * HOUSTON_WORKSPACES_ROOT and HOUSTON_CREDENTIALS_PATH can override its children. */

// Crash reporting. Dormant without SENTRY_DSN; a DSN in a source run needs the
// SENTRY_SEND_IN_DEV opt-in (activation rules: runtime-client/src/sentry/).
// Console capture mirrors the Rust engine's sentry-tracing wiring — every
// console.error becomes a Sentry event, info/warn become breadcrumbs — so the
// beta "no silent failures" error sites all report without per-site changes.
const sentry = initEngineSentry("host");
if (sentry) installConsoleCapture(sentry);
// The credential IS the switch — when it's absent (or dev-suppressed), say so
// loudly and name the remedy, per the features-default-ON rule.
console.info(
  sentry
    ? "[local-host] crash reporting: on (Sentry)"
    : process.env.SENTRY_DSN
      ? "[local-host] crash reporting: off (dev run; set SENTRY_SEND_IN_DEV=1 to send)"
      : "[local-host] crash reporting: off (no SENTRY_DSN)",
);

/** Log a fatal config/boot error, deliver it, and exit non-zero. */
async function fatal(...message: unknown[]): Promise<never> {
  console.error(...message);
  await sentry?.flush();
  process.exit(1);
}

async function remoteCredentialConfig(hostTokenEnv: string | undefined) {
  const url = process.env.HOUSTON_CREDENTIALS_URL;
  const orgSlug = process.env.HOUSTON_ORG_SLUG;
  const agentSlug = process.env.HOUSTON_AGENT_SLUG;
  if (url && orgSlug && agentSlug && hostTokenEnv) {
    return { url, orgSlug, agentSlug, podToken: hostTokenEnv };
  }
  if (url || (!process.env.HOUSTON_STORE_URL && (orgSlug || agentSlug))) {
    // A partial env is always a deploy bug — no profile sets only some of these.
    // Falling back to the (empty) file store would make every credential serve
    // read as an org-wide logout, and a legacy pod would even start rotating
    // refresh tokens locally against the gateway's rotation. Die loudly so the
    // pod restarts into a fixed spec instead of degrading silently.
    return fatal(
      "[local-host] incomplete managed credential gateway env: set HOUSTON_CREDENTIALS_URL, HOUSTON_ORG_SLUG, HOUSTON_AGENT_SLUG, and HOUSTON_HOST_TOKEN together.",
    );
  }
  return undefined;
}

const houstonHome = process.env.HOUSTON_HOME || join(homedir(), ".houston");
const hostTokenEnv = process.env.HOUSTON_HOST_TOKEN;
const hostToken = hostTokenEnv || randomBytes(32).toString("hex");
const remoteGateway = await remoteCredentialConfig(hostTokenEnv);
const managedStore = await managedStoreConfig(
  hostTokenEnv,
  houstonHome,
  (message) => fatal(message),
);
// Event-driven routines fire only where a trigger backend exists (a Composio
// project key + a public webhook URL) — that is Houston Cloud, i.e. a managed
// pod. Desktop and self-host carry no trigger backend. This one fact drives the
// product prompt (event wakes advertised only when true), the routine write
// gate, and the trigger-status route.
const triggersEnabled = process.env.HOUSTON_MANAGED_CLOUD === "1";
const routineSchedulerModeRaw =
  process.env.HOUSTON_ROUTINE_SCHEDULER_MODE || undefined;
const routineSchedulerMode =
  routineSchedulerModeRaw === undefined || routineSchedulerModeRaw === "local"
    ? "local"
    : routineSchedulerModeRaw === "external"
      ? "external"
      : await fatal(
          `[local-host] invalid HOUSTON_ROUTINE_SCHEDULER_MODE=${routineSchedulerModeRaw}; expected local or external.`,
        );
if (routineSchedulerMode === "external" && !triggersEnabled) {
  await fatal(
    "[local-host] HOUSTON_ROUTINE_SCHEDULER_MODE=external is valid only on managed cloud pods.",
  );
}
const durableTurns = managedStore?.podGateway
  ? (() => {
      const transcriptDualWrite =
        process.env.HOUSTON_TRANSCRIPT_DUAL_WRITE === "1";
      const turnLog = process.env.HOUSTON_TURN_LOG === "1";
      console.info(
        transcriptDualWrite
          ? "[boot] transcript dual-write ON (HOUSTON_TRANSCRIPT_DUAL_WRITE=1)"
          : "[boot] transcript dual-write OFF (HOUSTON_TRANSCRIPT_DUAL_WRITE unset)",
      );
      console.info(
        turnLog
          ? "[boot] turnlog capture ON (HOUSTON_TURN_LOG=1)"
          : "[boot] turnlog capture OFF (HOUSTON_TURN_LOG unset)",
      );
      return {
        gateway: managedStore.podGateway,
        turnlogGateway: process.env.HOUSTON_TURNLOG_URL
          ? {
              ...managedStore.podGateway,
              baseUrl: process.env.HOUSTON_TURNLOG_URL,
              // The turnlog is a different backend service and must never
              // share or mutate the object store's lease fence.
              fence: { ...managedStore.podGateway.fence },
            }
          : undefined,
        transcriptDualWrite,
        turnLog,
      };
    })()
  : undefined;
const host = buildMainHost({
  houstonHome,
  hostTokenEnv,
  hostToken,
  remoteGateway,
  managedStore,
  durableTurns,
  triggersEnabled,
  routineSchedulerMode,
  flushReports: async () => {
    await sentry?.flush(500);
  },
});

// (Integrations on/off/direct is announced by the host's own boot log —
// formatIntegrationsModeLog in local/host.ts — so no extra warning here.)

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

try {
  await host.start();
} catch (err) {
  // Hydration is a boot invariant in store-backed mode. Exit non-zero so the
  // orchestrator retries with a fresh emptyDir; never linger unready or sync it.
  await fatal("[local-host] startup failed:", err);
}

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
