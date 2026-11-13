import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  initEngineSentry,
  installConsoleCapture,
} from "@houston/runtime-client/sentry";

import { buildMainHost } from "./main-host";
import {
  installProcessErrorHandlers,
  installShutdownHandlers,
} from "./main-lifecycle";
import { managedStoreConfig } from "./managed-store-config";

/**
 * The local host entry point — the desktop sidecar the Tauri shell spawns. Same
 * host server, local adapter profile. The shell parses the `HOUSTON_HOST_LISTENING`
 * banner for {port, token}, exactly as it parses the runtime's today.
 *
 * Config (env, all optional):
 *   HOUSTON_HOME              ~/.houston (base for the three paths below)
 *   HOUSTON_WORKSPACES_ROOT   ~/.houston/workspaces
 *   HOUSTON_CREDENTIALS_PATH  ~/.houston/credentials.json
 *   HOUSTON_AGENTS_DIR        ~/.houston/agents (installed agent-config library)
 *   HOUSTON_CHAT_HISTORY_DB   ~/.houston/db/houston.db (Rust-era chat to migrate)
 *   HOUSTON_HOST_PORT         4318
 *   HOUSTON_HOST_BIND         127.0.0.1 (desktop). Self-host on a VPS sets
 *                             0.0.0.0 to expose it behind a TLS reverse proxy.
 *   HOUSTON_HOST_TOKEN        random per boot (set a fixed one for self-host)
 *   HOUSTON_CREDENTIALS_URL   managed pod only: gateway base URL for org credentials
 *   HOUSTON_ORG_SLUG          managed pod only: org slug for org credentials
 *   HOUSTON_AGENT_SLUG        managed pod only: agent slug for org credentials
 *   HOUSTON_RUNTIME_COMMAND   argv to launch a pi-runtime (space-separated);
 *                             explicit override (highest priority). Otherwise:
 *                             the compiled sidecar spawns ITSELF (in runtime
 *                             role via HOUSTON_SIDECAR_ROLE — see host.ts);
 *                             bundled Docker spawns dist/runtime/main.mjs; dev
 *                             falls back to `node --import tsx <repo>/packages/runtime/src/main.ts`.
 *   HOUSTON_APP_SYSTEM_PROMPT the product voice prompt (from the app)
 *   HOUSTON_MANAGED_CLOUD=1  serve managed-cloud capabilities (K8s pod)
 *   HOUSTON_SHUTDOWN_DRAIN_MS  managed pod only: how long a shutdown lets
 *                            in-flight turns finish (termination grace minus
 *                            the final sync's share); unset = short default
 *   HOUSTON_OAUTH_CALLBACK_BASE_URL  self-host only: the public origin for the
 *                             custom-integration OAuth callback (PRODUCT-1172)
 *   HOUSTON_PASSIVE=1        migration-source mode: no scheduler, no watcher
 *   HOUSTON_ROUTINE_SCHEDULER_MODE  local (default) | external (managed pod
 *                             only; disables cron fires, keeps reconcile)
 *   HOUSTON_STORE_URL         managed pod only: object-store gateway base URL
 *   HOUSTON_TRANSCRIPT_DUAL_WRITE=1  file-first transcript/doc DB shadow
 *   HOUSTON_TURN_LOG=1        relay-frame batches to managed turnlog ingest
 */

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

installProcessErrorHandlers();

try {
  await host.start();
} catch (err) {
  // Hydration is a boot invariant in store-backed mode. Exit non-zero so the
  // orchestrator retries with a fresh emptyDir; never linger unready or sync it.
  await fatal("[local-host] startup failed:", err);
}

installShutdownHandlers(host, sentry);
