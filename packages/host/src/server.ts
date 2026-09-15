import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Capabilities } from "@houston/protocol";
import type { SharedEndpointStore } from "./credentials/remote-shared-endpoint-store";
import {
  attachViewCapture,
  type ViewFamily,
  viewForPath,
} from "./docs/view-capture";
import type {
  Agent,
  UserId,
  Workspace,
  WorkspaceRuntime,
} from "./domain/types";
import type { EventHub } from "./events/hub";
import type { FeedbackSender } from "./feedback";
import type { WorkspacePaths } from "./paths";
import {
  type CredentialStore,
  type CredentialVault,
  LauncherClosedError,
  type RuntimeChannel,
  type TokenVerifier,
  type WorkspaceStore,
} from "./ports";
import type { AgentConfigsDeps } from "./routes/agent-configs";
import type { AssistantDeps } from "./routes/assistant";
import type { AssistantSandboxDeps } from "./routes/assistant-sandbox";
import type { CredentialServeHealer } from "./routes/credential-healer";
import type { CustomIntegrationDeps } from "./routes/custom-integrations";
import { bearer, json } from "./routes/http";
import type { IntegrationDeps } from "./routes/integrations";
import { BodyTooLargeError } from "./routes/read-body";
import { dispatchGroup } from "./routes/registry/all";
import { refuseOutOfCoordinatorScope } from "./routes/sandbox-scope";
import { handleStoreFenceGate } from "./routes/store-fence-gate";
import type { FireLock } from "./schedule/fire-lock";
import type { TranscriptShadow } from "./transcripts/http-shadow";
import type { TriggerEventLock } from "./triggers/fire";
import type { Vfs } from "./vfs";

export type { RuntimeProxy } from "./channel/proxy";
// `/health`'s body shape is part of this server's published surface; the route
// that serves it now lives in routes/meta.ts.
export { healthBody } from "./routes/meta";

/**
 * The operator-admin extension seam. The open server never imports an admin
 * route; it accepts an INJECTED request hook here and calls it after the events
 * stream. Nothing in-tree binds it anymore — the closed control plane that did
 * (`@houston/host-cloud`) was retired and deleted — but the seam stays as the
 * documented extension point for any private deployment's admin surface. No
 * profile in this repo sets it, so `/admin/*` simply 404s — exactly as a
 * request to any unmounted route would.
 *
 * Returns true when it handled the request (the server then stops routing), false
 * to fall through. Mirrors every other `handle*` route's contract.
 */
export type MountAdmin = (
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

export interface ControlPlaneDeps {
  verifier: TokenVerifier;
  /** Authenticated agent-scoped request seen for this agent id (docs/projector binding). */
  addressedAgent?: (agentId: string) => void;
  /**
   * Receives every successful view-route response body (docs/view-capture)
   * for publication to the managed doc store. Cloud pods only; absent on
   * desktop/self-host.
   */
  viewSink?: (agentId: string, family: ViewFamily, body: unknown) => void;
  store: WorkspaceStore;
  /** Connect-once: the one subscription credential per workspace, served to its sandboxes. */
  credentials: CredentialStore;
  /** Managed gateway store for the active organization's shared local endpoint. */
  sharedEndpoints?: SharedEndpointStore;
  /** Validates per-sandbox HMAC tokens (the sandbox-facing credential endpoint). */
  vault: CredentialVault;
  /** Managed-pod recovery for an absent/dead central credential row. */
  credentialHealer?: CredentialServeHealer;
  /**
   * RuntimeChannel per workspace hosting model (gke → ProxyChannel, cloudrun →
   * TurnChannel; the local profile adds its own in P4). A workspace whose
   * runtime has no channel wired answers 503.
   */
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  /** Workspace file store backing the typed .houston families; absent → those routes 503. */
  vfs?: Vfs;
  /** Where agent files live in the vfs (cloud prefixes vs local tree). Default: cloud. */
  paths?: WorkspacePaths;
  /** Global reactivity fan-out (the `/v1/events` channel); absent → that route 503s. */
  events?: EventHub;
  /** What this deployment can do; served at /v1/capabilities for the UI to gate on. */
  capabilities: Capabilities;
  /**
   * The agent's absolute on-disk directory, when this deployment is co-located
   * with the files (local profile). Serialized as `dir` on agent payloads so
   * the desktop shell can reveal/open in the OS file manager (HOU-677).
   */
  agentDir?: (ws: Workspace, agent: Agent) => string;
  /**
   * True when this install carried over a legacy Rust-desktop chat-history db —
   * i.e. the user is migrating from the old desktop build. Surfaced on
   * `/v1/version` so the desktop UI can show its one-time "reconnect your AI"
   * moment (the migrated provider credentials are not portable). Absent/false on
   * a fresh install and on the cloud profile.
   */
  chatHistoryMigrated?: boolean;
  /**
   * Operator-dashboard request hook (CLOSED surface, injected by the cloud entry
   * point). Omit to disable the `/admin/*` API entirely — the local profile never
   * sets it, so `/admin/*` 404s there.
   */
  mountAdmin?: MountAdmin;
  /** "Send feedback" intake (web build → Linear); omit and POST /feedback answers 503. */
  feedback?: FeedbackSender;
  /** Third-party integrations (Composio, platform mode); absent → integration routes 503. */
  integrations?: IntegrationDeps;
  /**
   * Custom integrations (HOU-550): user-added API/MCP sources compiled to agent
   * tools by the embedded executor engine. Absent → the definition routes 404
   * (client reads that as "unsupported host") and the sandbox setup routes 503.
   */
  customIntegrations?: CustomIntegrationDeps["customIntegrations"];
  /**
   * Installed agent-config library (the create-agent picker's "installed"
   * source + GitHub agent install). Absent → the list reads empty and installs
   * answer 503.
   */
  agentConfigs?: AgentConfigsDeps;
  /**
   * True only when a trusted gateway fronts EVERY request to this host (the
   * managed cloud pod — same stance as LocalHostOptions.gatewayFronted).
   * Routine writes then record the gateway-minted acting identity (the
   * `x-houston-acting-as` payload sub) as `created_by` instead of this host's
   * single local user id — that sub is what the gateway can re-authorize when
   * the fired routine's integration calls present it (C2 auth mode 3; the
   * pod's local user id has no upstream membership, so it would 401 every
   * call). Leave false on the desktop: an inbound acting header there is
   * untrusted client input and is ignored.
   */
  gatewayFronted?: boolean;
  /**
   * The org owner's canonical user id (the gateway identity directory's sub),
   * stamped into managed pods as env. Routine writes on a gateway-fronted host
   * fall back to it when a request carries no decodable acting-as header, and
   * seed installs stamp it when no acting identity exists — the control-plane
   * fire planner skips any routine without a `created_by`, so no routine may
   * be born authorless. Absent on desktop/self-host (the local user id is the
   * recorded creator there).
   */
  ownerSub?: string;
  /** Gateway-fronted but the egress still reaches loopback (the dev launcher's
   *  on-machine "pods"): skips the managed-cloud public-HTTPS endpoint
   *  validation. See AgentRouteDeps.loopbackEgress. */
  loopbackEgress?: boolean;
  /** Immediate object-storage sync of the pod tree; see AgentRouteDeps.storeSyncFlush. */
  storeSyncFlush?: () => Promise<void>;
  /**
   * Live /agents/* request count (createControlPlaneServer wires it; see the
   * AgentRouteDeps.agentRequestCount doc for why it exists and why it is
   * scoped to the per-agent surface only).
   */
  agentRequestCount?: () => number;
  /**
   * Cross-replica dedup lock for the pod trigger-events route (C9): the Go
   * control plane delivers external events to a managed pod; the lock stops a
   * redelivery double-firing. Absent → that route 503s. Present on every host
   * with a turn bus.
   */
  triggerLock?: TriggerEventLock;
  /** Shared scheduled-instant lock for local scans and CP-delivered fires. */
  routineFireLock?: FireLock;
  /** Scheduled-instant lock TTL. Managed pods use 24h; other profiles 1h. */
  routineFireDedupTtlSec?: number;
  /** File-authoritative transcript writes mirrored through the sandbox facade. */
  transcriptShadow?: TranscriptShadow;
  /**
   * Whether this deployment can fire event-driven routines (a trigger backend —
   * a Composio project key + a public webhook URL — exists). True on Houston
   * Cloud only; false on desktop/self-host. Threaded to the routine write gate
   * and the trigger-status route (see AgentRouteDeps.triggersEnabled). Distinct
   * from `capabilities.triggers`, which the managed gateway advertises at its
   * edge and this host never sets on itself.
   */
  triggersEnabled?: boolean;
  /**
   * Agent Store gateway API base ("install from a link" fetches a shared
   * agent's IR from it). Absent → the route falls back to the
   * `HOUSTON_AGENTSTORE_API_URL` config default.
   */
  agentStoreApiUrl?: string;
  corsOrigin?: string;
  /**
   * Prometheus exposition for GET /metrics (HOU-1011): the boot-span ledger,
   * rendered by prom-client. Token-gated like every non-public route. Absent →
   * the route 404s (a test server without telemetry stays honest).
   */
  metrics?: { render(): Promise<string>; contentType: string };
  /** Managed-store write-fence state; absent on desktop and self-host. */
  storeFenced?: () => boolean;
  /**
   * Materialize a synthetic (dot-named) agent's directory — the personal
   * assistant's home (routes/assistant.ts). Local filesystem profiles only;
   * absent → `GET /v1/assistant` answers 503 instead of handing out an address
   * that resolves to nothing.
   */
  ensureSyntheticAgentDir?: AssistantDeps["ensureSyntheticAgentDir"];
  /**
   * Where this deployment performs user-facing Houston operations, from the
   * one resolver (`routes/assistant-wiring.ts`): the gateway on a fronted pod,
   * this host itself when nothing fronts it. Absent → the runtime-facing
   * dispatcher falls back to reading the configured env pair alone.
   */
  assistantGateway?: AssistantSandboxDeps["assistantGateway"];
}

function applyCors(deps: ControlPlaneDeps, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", deps.corsOrigin || "*");
  // X-Houston-App-Version: the desktop app's build-identity header — sent by
  // its shared gateway transport to this host too, so the preflight must
  // allow it even though the host ignores it.
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Houston-App-Version",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  // Retry-After is NOT a CORS-safelisted response header: without this a
  // cross-origin caller (the Tauri webview, the dev web app on vite's port, any
  // web build pointed at a host on another origin) cannot read the "ask me
  // again in N seconds" hint this host attaches to its 503s (channel/
  // probe-wake.ts, local/host.ts's drain). The client captures it as
  // `HoustonEngineError.retryAfterMs` and schedules its retry on it.
  res.setHeader("Access-Control-Expose-Headers", "Retry-After");
}

/** Resolve the caller to a verified user id, or null if unauthenticated. */
async function principal(
  deps: ControlPlaneDeps,
  req: IncomingMessage,
  url: URL,
): Promise<UserId | null> {
  const token = bearer(req, url);
  if (!token) return null;
  const verified = await deps.verifier.verify(token);
  return verified?.userId ?? null;
}

async function handle(
  deps: ControlPlaneDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  applyCors(deps, res);
  const method = req.method || "GET";
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://control-plane.local");
  const path = url.pathname;

  const entry = { deps, method, path, url, req, res };

  // Public: health + the v3 meta surface (capabilities are not secrets; the UI
  // reads them before sign-in to shape itself).
  if (await dispatchGroup("meta", entry)) return;
  // pi-ai's full static model catalog (every runnable provider + model), the
  // SAME on every deployment. Static + not user-scoped, so it rides the public
  // meta surface next to capabilities — the picker/AI-Models tab read it to
  // shape themselves.
  if (await dispatchGroup("catalog", entry)) return;

  // THE COORDINATOR'S REACH (routes/sandbox-scope.ts). Every /sandbox/* route
  // below authenticates a sandbox token, which is the right gate for an
  // ordinary agent and too wide a one for the personal assistant: this refuses
  // the families the coordinator has no tool for before any of them is asked.
  if (refuseOutOfCoordinatorScope(deps, path, url, req, res)) return;
  // Sandbox-facing credential serve (HMAC sandbox token, not a user JWT).
  if (await dispatchGroup("sandbox-credential", entry)) return;
  // Sandbox-facing revoked-token report (HOU-952): the runtime's turn is the
  // only witness to a provider revoking a served token, since a revoked token
  // is not an expired one and the serve path cannot tell them apart.
  if (await dispatchGroup("sandbox-credential-revoked", entry)) return;
  // Sandbox-facing central usage probe (Copilot quota needs the host-held token).
  if (await dispatchGroup("sandbox-provider-usage", entry)) return;
  // Runtime-facing integration proxy (HMAC sandbox token, not a user JWT).
  if (await dispatchGroup("sandbox-integrations", entry)) return;
  // Runtime-facing custom-integration setup (detect/add; HMAC sandbox token).
  if (await dispatchGroup("sandbox-custom-integrations", entry)) return;
  // Public custom-integration OAuth callback (PRODUCT-1172): the user's
  // browser lands here from the service's consent screen with no Houston
  // bearer token — the single-use `state` is its authentication.
  if (await dispatchGroup("custom-oauth-callback", entry)) return;
  // A pod that lost its object-store write fence must not accept writes it
  // can no longer persist (PRODUCT-1706): the runtime's own saves first, the
  // user-facing /agents/ writes after auth below.
  if (handleStoreFenceGate(deps, method, path, res, "sandbox")) return;
  // Runtime-facing scheduled-task save (merge-safe; HMAC sandbox token). The
  // agent's save_routine tool calls this instead of writing routines.json.
  if (await dispatchGroup("sandbox-routines", entry)) return;
  // Runtime-facing memory save (merge-safe + provenance-stamping; HMAC sandbox
  // token). The agent's save_learning tool calls this instead of editing
  // learnings.json — it is the only path that records who taught a learning.
  if (await dispatchGroup("sandbox-learnings", entry)) return;
  // Runtime-facing mission board access (PRODUCT-1244; HMAC sandbox token).
  // The agent's start_mission / list_missions / update_mission_status tools
  // call these instead of touching activity.json, and the runtime reports each
  // turn end to /settle so agent-started missions leave Running unobserved.
  if (await dispatchGroup("sandbox-missions", entry)) return;
  // Runtime-facing skills directory (HMAC sandbox token). The agent's
  // find_skills / install_skill tools call this to answer "which skill should
  // I use for X?" and to install the answer into its own skills tree.
  if (await dispatchGroup("sandbox-skills", entry)) return;
  // Runtime-facing Houston operations (HMAC sandbox token → gateway). The
  // agent's houston_call tool dispatches here so the runtime never holds the
  // credential that can act on the user's account; off unless this deployment
  // set HOUSTON_ASSISTANT_CP_URL + HOUSTON_ASSISTANT_TOKEN.
  if (await dispatchGroup("sandbox-assistant", entry)) return;
  // Runtime transcript shadow facade (HMAC sandbox token → pod-auth gateway).
  if (await dispatchGroup("sandbox-transcripts", entry)) return;

  // Everything past here is authenticated.
  const userId = await principal(deps, req, url);
  if (!userId) return json(res, 401, { error: "unauthorized" });
  if (handleStoreFenceGate(deps, method, path, res, "agents")) return;
  // An AUTHENTICATED /agents/<id>/ request names the agent this host is
  // addressed as — the doc shadow's binding signal on hosts whose workspace
  // holds more than one agent directory (rename leftovers). After auth only:
  // an anonymous caller must never pick the binding.
  if (deps.addressedAgent) {
    const addressed = /^\/agents\/([^/]+)(?:\/|$)/.exec(path);
    if (addressed?.[1]) deps.addressedAgent(decodeURIComponent(addressed[1]));
  }

  const authenticated = { ...entry, userId };

  // The global reactivity stream (SSE): this user's domain-change events only.
  // Long-lived — do not fall through, and never end the response here.
  if (await dispatchGroup("events", authenticated)) return;
  // Pod-level busy probe for the control plane's busy-aware engine rolls.
  if (await dispatchGroup("pod-activity", authenticated)) return;
  // Prometheus text exposition of the boot-span ledger (HOU-1011).
  if (await dispatchGroup("metrics", authenticated)) return;

  if (
    deps.mountAdmin &&
    (await deps.mountAdmin(userId, method, path, url, req, res))
  )
    return;

  // "Send feedback" from the web build: same payload the desktop files to Linear
  // via Tauri, fronted here so the browser never holds the Linear key.
  if (await dispatchGroup("feedback", authenticated)) return;

  // User-level resources (workspaces, preferences) — no agent in the path.
  // Marketplace reads (skills.sh search/popular, GitHub repo discovery) also
  // answer top-level for direct API callers; the shipped clients call them
  // agent-scoped (skills-remote.ts) so the hosted gateway can proxy them.
  if (await dispatchGroup("skills-directory", authenticated)) return;
  if (await dispatchGroup("shared-skills", authenticated)) return;
  if (await dispatchGroup("account", authenticated)) return;
  if (await dispatchGroup("portable-account", authenticated)) return;
  if (await dispatchGroup("portable-from-store", authenticated)) return;
  // Desktop→cloud migration source listing (HOU-719): every agent across every
  // workspace with its migration manifest. Desktop-local by design — the cloud
  // gateway proxies only agent-scoped routes, so a pod never serves this.
  if (await dispatchGroup("migration-source", authenticated)) return;
  if (await dispatchGroup("agent-configs", authenticated)) return;
  // Custom-integration definitions — BEFORE the generic provider routes, which
  // claim the whole `/v1/integrations` subtree and would swallow `custom/*`.
  if (await dispatchGroup("custom-integrations", authenticated)) return;
  if (await dispatchGroup("integrations", authenticated)) return;
  // Pre-agent provider connect (first-run onboarding): a hidden setup runtime
  // runs the OAuth so the user can connect their AI before any agent exists.
  if (await dispatchGroup("setup-runtime", authenticated)) return;
  // Personal-assistant discovery: which hidden agent holds it and which
  // conversation to open. The chat itself rides the ordinary per-agent routes
  // below — this only hands out the address.
  if (await dispatchGroup("assistant", authenticated)) return;

  // Pod trigger delivery (C9) — matched before the generic per-agent dispatch
  // (the runtime has no trigger routes). The Go control plane POSTs external
  // events here for a managed pod; the pod fires the matching routine.
  if (await dispatchGroup("trigger-events", authenticated)) return;
  // Pod cron delivery — same internal-only trust posture as trigger-events.
  if (await dispatchGroup("routine-fires", authenticated)) return;

  // One agent's color. Agent-scoped, but NOT part of the per-agent dispatch
  // below: it writes the same `agent_colors` PREFERENCE the app's color sync
  // owns, so it is served here, ahead of the per-agent surface, rather than
  // proxied to the agent's runtime, which knows nothing about that doc.
  if (await dispatchGroup("agent-color", authenticated)) return;

  // The user's own agents, then everything scoped to ONE of them. Every group
  // past the first is agent-phase: the dispatcher runs the ownership check for
  // the agent the matched pattern names, so none of them can answer without one.
  //
  // ORDER IS THE WHOLE CONTRACT here, because the last group claims the rest of
  // the subtree: "agent-proxy" forwards ANY `/agents/:agentId/…` path to the
  // agent's own engine (routes/agents.ts), so a route the HOST serves exists
  // only by being declared above it. Each group's own module says why it is
  // host-served; registry/groups.ts is where the order itself is stated.
  if (await dispatchGroup("agents", authenticated)) return;
  if (await dispatchGroup("agent-crud", authenticated)) return;
  if (await dispatchGroup("agent-credentials", authenticated)) return;
  if (await dispatchGroup("routine-runs", authenticated)) return;
  if (await dispatchGroup("agent-activity", authenticated)) return;
  if (await dispatchGroup("agent-approvals", authenticated)) return;
  if (await dispatchGroup("agent-integrations", authenticated)) return;
  if (await dispatchGroup("agent-missions", authenticated)) return;
  if (await dispatchGroup("agent-data", authenticated)) return;
  if (await dispatchGroup("trigger-status", authenticated)) return;
  if (await dispatchGroup("agent-file", authenticated)) return;
  if (await dispatchGroup("skills-manifest", authenticated)) return;
  if (await dispatchGroup("skills", authenticated)) return;
  if (await dispatchGroup("skills-remote", authenticated)) return;
  if (await dispatchGroup("workspace-files", authenticated)) return;
  if (await dispatchGroup("attachments", authenticated)) return;
  if (await dispatchGroup("portable-preview", authenticated)) return;
  if (await dispatchGroup("portable-anonymize", authenticated)) return;
  if (await dispatchGroup("portable-export", authenticated)) return;
  if (await dispatchGroup("migration", authenticated)) return;
  if (await dispatchGroup("portable-store", authenticated)) return;
  if (await dispatchGroup("agent-proxy", authenticated)) return;

  return json(res, 404, { error: "not found" });
}

/** Build the frontend-facing host API server. */
export function createControlPlaneServer(deps: ControlPlaneDeps): Server {
  // Live count of /agents/* requests, long-lived SSE streams included — the
  // /activity busy probe reads it so the gateway's idle sweep never sleeps a
  // pod with an open per-agent stream. `close` fires on both completion and a
  // severed connection (and always after `finish` on modern Node), so every
  // increment has exactly one decrement.
  let agentRequests = 0;
  const counted: ControlPlaneDeps = {
    ...deps,
    agentRequestCount: () => agentRequests,
  };
  return createServer((req, res) => {
    const path = (req.url || "/").split("?")[0] ?? "";
    if (path === "/agents" || path.startsWith("/agents/")) {
      agentRequests++;
      res.once("close", () => {
        agentRequests--;
      });
    }
    // Tee the view routes' successful answers into the managed doc store so
    // the gateway can serve them while this pod is asleep. Transparent to the
    // client; only 200 JSON bodies under the cap publish.
    if (deps.viewSink && (req.method ?? "GET").toUpperCase() === "GET") {
      const view = viewForPath(path);
      if (view) {
        attachViewCapture(res, (body) =>
          deps.viewSink?.(view.agentId, view.family, body),
        );
      }
    }
    handle(counted, req, res).catch((err) => {
      // An over-cap body maps to 413 (Payload Too Large) with its own clean
      // message; a host mid-shutdown refusing to wake a runtime answers the
      // gateway's waking shape (503 + Retry-After) so the client re-sends
      // against the replacement instead of rendering a bug; everything else
      // is a 500. Close the connection on 413: capping the body leaves unread
      // bytes on the socket that would poison keep-alive.
      const tooLarge = err instanceof BodyTooLargeError;
      const closed = err instanceof LauncherClosedError;
      const message = err instanceof Error ? err.message : String(err);
      try {
        if (!res.headersSent) {
          if (closed) {
            json(
              res,
              503,
              { error: "engine unavailable", detail: message },
              { "Retry-After": "2" },
            );
          } else {
            json(
              res,
              tooLarge ? 413 : 500,
              { error: message },
              tooLarge ? { Connection: "close" } : {},
            );
          }
        } else if (!res.writableEnded) res.end();
      } catch {
        // The socket was already torn down while aborting the oversized body —
        // there is nothing left to respond on.
      }
    });
  });
}
