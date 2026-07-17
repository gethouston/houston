import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { HttpObjectStore } from "@houston/runtime-client/object-sync";
import {
  initEngineSentry,
  installConsoleCapture,
} from "@houston/runtime-client/sentry";
import {
  LOCAL_CAPABILITIES,
  MANAGED_CLOUD_CAPABILITIES,
} from "../capabilities";
import { houstonSystemPrompt } from "../houston-prompt";
import { installParentWatchdog } from "../parent-watchdog";
import { isBenignRecursiveWatchRace } from "../watch/watcher-race";
import { buildLocalHost } from "./host";
import { runtimeCommand } from "./runtime-command";

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
 *   HOUSTON_PASSIVE=1        migration-source mode: no scheduler, no watcher
 *   HOUSTON_STORE_URL         managed pod only: object-store gateway base URL
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

function optionalPositiveNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

async function storeSyncConfig(hostTokenEnv: string | undefined) {
  const url = process.env.HOUSTON_STORE_URL;
  if (!url) return undefined;
  const orgSlug = process.env.HOUSTON_ORG_SLUG;
  const agentSlug = process.env.HOUSTON_AGENT_SLUG;
  if (!orgSlug || !agentSlug || !hostTokenEnv) {
    return fatal(
      "[local-host] incomplete managed object-store env: set HOUSTON_STORE_URL, HOUSTON_ORG_SLUG, HOUSTON_AGENT_SLUG, and HOUSTON_HOST_TOKEN together.",
    );
  }
  const baseUrl = `${url.replace(/\/+$/, "")}/v1/pod/store/${encodeURIComponent(orgSlug)}/${encodeURIComponent(agentSlug)}`;
  const hydrateMaxMb = optionalPositiveNumber("HOUSTON_HYDRATE_MAX_MB");
  return {
    store: new HttpObjectStore({ baseUrl, token: hostTokenEnv }),
    quietMs: optionalPositiveNumber("HOUSTON_STORE_SYNC_QUIET_MS"),
    intervalMs: optionalPositiveNumber("HOUSTON_STORE_SYNC_INTERVAL_MS"),
    maxHydrateBytes:
      hydrateMaxMb === undefined ? undefined : hydrateMaxMb * 1024 * 1024,
  };
}

const houstonHome = process.env.HOUSTON_HOME || join(homedir(), ".houston");
const hostTokenEnv = process.env.HOUSTON_HOST_TOKEN;
const hostToken = hostTokenEnv || randomBytes(32).toString("hex");
const remoteGateway = await remoteCredentialConfig(hostTokenEnv);
const host = buildLocalHost({
  workspacesRoot:
    process.env.HOUSTON_WORKSPACES_ROOT || join(houstonHome, "workspaces"),
  credentialsPath:
    process.env.HOUSTON_CREDENTIALS_PATH ||
    join(houstonHome, "credentials.json"),
  // The installed agent-config library — the Rust engine's tree, carried over
  // so previously installed agents keep showing in the create-agent picker.
  agentConfigsDir:
    process.env.HOUSTON_AGENTS_DIR || join(houstonHome, "agents"),
  // The Rust-era chat-history db. Default to the canonical path; the migration
  // is a no-op when it is absent (a fresh install) or already done (marker).
  chatHistoryDbPath:
    process.env.HOUSTON_CHAT_HISTORY_DB ||
    join(houstonHome, "db", "houston.db"),
  port: Number(process.env.HOUSTON_HOST_PORT || 4318),
  // Loopback by default (desktop). Self-host sets HOUSTON_HOST_BIND=0.0.0.0.
  bind: process.env.HOUSTON_HOST_BIND || undefined,
  token: hostToken,
  // Redact the token in the startup banner whenever it came from the
  // environment (a pod/self-host token an orchestrator already knows) or we are
  // a managed cloud pod — echoing it there just leaks a credential into
  // plaintext logs. The desktop sidecar mints a random per-boot token (no
  // HOUSTON_HOST_TOKEN) and its supervisor reads it back from this line, so
  // that case keeps the full token.
  redactBannerToken:
    !!hostTokenEnv || process.env.HOUSTON_MANAGED_CLOUD === "1",
  runtimeCommand: runtimeCommand(),
  // Managed pods pre-spawn their agent's runtime at boot so the ~10s runtime
  // start overlaps the pod wake instead of the user's first message.
  eagerRuntime: process.env.HOUSTON_EAGER_RUNTIME === "1",
  // The real Tauri app hands over its own product prompt; this is the built-in
  // default so the agent knows how to create Skills/Routines/learnings.
  systemPrompt: process.env.HOUSTON_APP_SYSTEM_PROMPT || houstonSystemPrompt(),
  capabilities:
    process.env.HOUSTON_MANAGED_CLOUD === "1"
      ? MANAGED_CLOUD_CAPABILITIES
      : LOCAL_CAPABILITIES,
  // Managed pods sit behind the gateway (it enforces the pod token and mints
  // x-houston-acting-as); relay that header to the runtime so integration
  // calls act as the driving user. Desktop/self-host stay direct → false.
  gatewayFronted: process.env.HOUSTON_MANAGED_CLOUD === "1",
  credentials: remoteGateway,
  sharedEndpoints: remoteGateway,
  // Active-time reporting rides the same managed-pod gateway quadruple: the
  // env being present IS the switch (desktop/self-host never set it).
  usageReporting: remoteGateway,
  // Migration-source spawns (HOU-719): serve + migrate on boot, but never fire
  // routines or churn watch events while the cloud app reads the old tree.
  passive: process.env.HOUSTON_PASSIVE === "1",
  storeSync: await storeSyncConfig(hostTokenEnv),
  // Platform-mode integrations: desktops get HOUSTON_INTEGRATIONS_URL (the
  // cloud gateway holding Houston's Composio key); self-host + the managed pod
  // set their own COMPOSIO_API_KEY and go direct. Neither → integrations off.
  integrations: {
    composioApiKey: process.env.COMPOSIO_API_KEY || undefined,
    gatewayUrl: process.env.HOUSTON_INTEGRATIONS_URL || undefined,
    // Managed pods run with a real HOUSTON_HOST_TOKEN (the gateway can recompute
    // it): pass it as the pod token so a routine turn authenticates as its
    // creator (C2). The desktop's token is a random per-boot secret, not a pod
    // token the gateway knows, so leave it unset there.
    podToken: hostTokenEnv || undefined,
  },
  onRuntimeLog: (line) => process.stderr.write(line),
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
