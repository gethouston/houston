import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { Capabilities } from "@houston/protocol";
import { SingleUserVerifier } from "../auth/verify";
import { LOCAL_CAPABILITIES } from "../capabilities";
import { refreshViewsOnEvents } from "../docs/view-warm";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { StoreSyncDaemon } from "../store-sync";
import { FsVfs } from "../vfs";
import { managedBridgeCapability } from "./bridge-capability";
import type { createHostBase } from "./host-base";
import type { createHostIntegrations } from "./host-integrations";
import { LOCAL_USER, severityLog } from "./host-log";
import type { LocalHostOptions } from "./host-options";
import type { createHostRuntime } from "./host-runtime";

export function createHostServer(
  opts: LocalHostOptions,
  base: ReturnType<typeof createHostBase>,
  runtime: ReturnType<typeof createHostRuntime>,
  integration: ReturnType<typeof createHostIntegrations>,
) {
  const {
    store,
    vfs,
    paths,
    bus,
    boot,
    events,
    vault,
    credentials,
    sharedEndpoints,
    assistantGateway,
    transcriptShadow,
    docShadow,
    docProjector,
  } = base;
  const { channel, credentialHealer, agentDir, liveAgentDir } = runtime;
  const { registry, integrations, customIntegrations } = integration;
  // Did this install carry over a Rust-desktop chat-history db? Its mere
  // presence means the user is migrating from the legacy desktop build — their
  // agents + history came across but their provider credentials did NOT (a
  // different OAuth client), so the UI must guide them to reconnect once. A
  // synchronous existence check (the same gate `start()` uses before running
  // the migration) is enough; surfaced on `/v1/version` for the frontend to
  // read. Stays true across re-boots (the db file lingers), but the UI persists
  // its own "already shown" flag, so the reconnect moment still fires only once.
  const chatHistoryMigrated = !!(
    opts.chatHistoryDbPath && existsSync(opts.chatHistoryDbPath)
  );

  // C9 event-driven routines are served ONLY where the Go cloud gateway fronts
  // the deployment (managed cloud): the Go control plane owns trigger
  // reconciliation and the ingress, and the gateway's edge advertises the
  // `triggers` capability. This TS host carries no self-host trigger backend —
  // the pod's only trigger surface is the delivery route (trigger-events), wired
  // below via `triggerLock`. Self-host and desktop simply don't get triggers.

  // The installed agent-config library. FsVfs keys must be non-empty, so root
  // the vfs at the library's PARENT and address it by its basename — this vfs
  // instance is only ever handed to the agent-configs route, which stays under
  // that prefix.
  const agentConfigs = opts.agentConfigsDir
    ? {
        vfs: new FsVfs(dirname(opts.agentConfigsDir)),
        root: () => basename(opts.agentConfigsDir as string),
      }
    : undefined;

  const capabilities: Capabilities = {
    ...(opts.capabilities ?? LOCAL_CAPABILITIES),
    ...managedBridgeCapability(opts.gatewayFronted, opts.credentials),
    // Served capabilities advertise the integrations actually wired, not the
    // profile's nominal list — an unconfigured deployment says [] honestly.
    integrations: registry.ids(),
    // On exactly when this host serves a browser-reachable OAuth callback.
    customIntegrationOAuth: customIntegrations.oauthSupported,
    // `triggers` is never advertised here: this host has no trigger backend. On
    // managed cloud the Go edge advertises the capability; a pod/self-host/desktop
    // stays byte-identical to the nominal profile (absent = off, protocol #core).
  };
  const syncDaemon = opts.storeSync
    ? new StoreSyncDaemon({
        ...opts.storeSync,
        rootDir: dirname(opts.workspacesRoot),
        // FsWatcher below already watches this subtree for reactivity. Avoid a
        // second, redundant inotify watch over it (HOU-1237).
        watchExcludeDirs: [opts.workspacesRoot],
        log: severityLog,
      })
    : undefined;
  // Per-family publish chains for the view sink (see viewSink below).
  const viewTails = new Map<string, Promise<void>>();
  const deps: ControlPlaneDeps = {
    verifier: new SingleUserVerifier({ token: opts.token, userId: LOCAL_USER }),
    store,
    credentials,
    credentialHealer,
    sharedEndpoints,
    vault,
    vfs,
    paths,
    events,
    channels: { local: channel },
    capabilities,
    chatHistoryMigrated,
    integrations,
    customIntegrations,
    // Every local host has a turn bus, so the internal pod trigger-events route is
    // always available — on managed cloud the Go control plane POSTs delivered
    // events to it. The lock dedupes redeliveries.
    triggerLock: bus,
    routineFireLock: bus,
    routineFireDedupTtlSec: opts.gatewayFronted ? 86_400 : 3600,
    transcriptShadow,
    agentConfigs,
    // Managed pods record the gateway-minted acting identity as a routine's
    // `created_by` (C2 — the sub the gateway re-authorizes at fire time);
    // the desktop ignores the header and keeps stamping the local owner.
    gatewayFronted: opts.gatewayFronted ?? false,
    // Org-owner fallback creator for routine writes with no acting header —
    // an authorless routine is not fireable by the control-plane planner.
    ownerSub: opts.ownerSub,
    // Event-driven routines fire only where a trigger backend exists (Houston
    // Cloud). Off on desktop/self-host: the write gate refuses trigger bindings
    // and the trigger-status route reports them as unable to wake.
    triggersEnabled: opts.triggersEnabled ?? false,
    loopbackEgress: opts.loopbackEgress ?? false,
    // The desktop shell reveals/opens agent folders in the OS file manager;
    // give it the REAL directory (the agent id is a route key, not a path).
    agentDir: (_ws, a) => agentDir(a.id),
    // The personal assistant's home. `liveAgentDirFor` is the ONE place that
    // may create an agent directory with no create path behind it (its
    // dot-segment carve-out), so discovery goes through it rather than
    // mkdir-ing a second way.
    ensureSyntheticAgentDir: (agentId) => {
      liveAgentDir(agentId);
    },
    // Where this host performs Houston operations, from the one resolver —
    // the same value the spawned runtimes carry in their environment.
    assistantGateway: () => assistantGateway,
    corsOrigin: "*",
    // Boot-span ledger behind GET /metrics (HOU-1011). Token-gated like every
    // non-public route: timings aren't secrets, but there is no reason to
    // widen the unauthenticated surface for them.
    metrics: { render: () => boot.render(), contentType: boot.contentType },
    storeFenced: syncDaemon ? () => syncDaemon.fenced : undefined,
    addressedAgent: docProjector
      ? (agentId) => docProjector.bindAddressed(agentId)
      : undefined,
    // Publish the view routes' answers (providers, usage, custom definitions)
    // to the managed doc store; the gateway serves them while the pod is
    // asleep. Cloud pods only (docShadow exists only under dual-write).
    viewSink:
      docShadow && docProjector
        ? (agentId, family, body) => {
            // Same cross-post rule as the file projector: the doc route
            // names ONE agent; a view captured for any other id (a leftover
            // directory's /skills) must never land under the bound agent.
            // Publishes are SERIALIZED per family so two captures in flight
            // land in capture order — a detached pair could otherwise let
            // the older body win the CAS retry.
            const prior = viewTails.get(family) ?? Promise.resolve();
            const task = prior
              .then(() => docProjector.boundAgent())
              .then((bound) => {
                if (bound !== agentId) {
                  console.warn(
                    `[view-docs] refusing ${family} publish for ${agentId} (route bound to ${bound ?? "nothing yet"})`,
                  );
                  return;
                }
                return docShadow.put(family, body);
              })
              .catch((error: unknown) => {
                console.error(`[view-docs] ${family} publish failed`, error);
              })
              .finally(() => {
                if (viewTails.get(family) === task) viewTails.delete(family);
              });
            viewTails.set(family, task);
          }
        : undefined,
  };

  const server = createControlPlaneServer(deps);
  if (docShadow) {
    // Views go stale on CHANGE without a live read (a skill the agent
    // installs overnight); re-capture on the domain events that invalidate
    // them.
    refreshViewsOnEvents({
      port: opts.port,
      token: opts.token,
      store,
      events,
      userId: LOCAL_USER,
    });
  }

  return { server, syncDaemon };
}
