import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { type Capabilities, PROTOCOL_VERSION } from "@houston/protocol";
import type { SharedEndpointStore } from "./credentials/remote-shared-endpoint-store";
import type {
  Agent,
  UserId,
  Workspace,
  WorkspaceRuntime,
} from "./domain/types";
import type { EventHub } from "./events/hub";
import {
  type FeedbackPayload,
  type FeedbackSender,
  parseFeedbackPayload,
} from "./feedback";
import type { LocalActionApprovals } from "./integrations/action-approvals";
import type { LocalIntegrationGrants } from "./integrations/grants";
import type { WorkspacePaths } from "./paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeChannel,
  TokenVerifier,
  WorkspaceStore,
} from "./ports";
import { handleAccount } from "./routes/account";
import { handleActionApprovals } from "./routes/action-approvals";
import {
  type AgentConfigsDeps,
  handleAgentConfigs,
} from "./routes/agent-configs";
import { handleAgents } from "./routes/agents";
import { handleCatalog } from "./routes/catalog";
import { handleSandboxCredential } from "./routes/credential";
import {
  type CustomIntegrationDeps,
  handleCustomIntegrations,
  handleSandboxCustomIntegrations,
} from "./routes/custom-integrations";
import { handleEventStream } from "./routes/events-stream";
import { bearer, json, readJson } from "./routes/http";
import { handleIntegrationGrants } from "./routes/integration-grants";
import {
  handleIntegrations,
  type IntegrationDeps,
} from "./routes/integrations";
import { handleSandboxIntegrations } from "./routes/integrations-sandbox";
import { handleMigrationSource } from "./routes/migration-source";
import { handlePortableAccount } from "./routes/portable";
import { handlePortableFromStore } from "./routes/portable-from-store";
import { BodyTooLargeError } from "./routes/read-body";
import { handleSetupRuntime } from "./routes/setup-runtime";
import { handleSkillsDirectory } from "./routes/skills-directory";
import { handleTriggerEvents } from "./routes/trigger-events";
import type { TriggerEventLock } from "./triggers/fire";
import type { Vfs } from "./vfs";

export type { RuntimeProxy } from "./channel/proxy";

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
  store: WorkspaceStore;
  /** Connect-once: the one subscription credential per workspace, served to its sandboxes. */
  credentials: CredentialStore;
  /** Managed gateway store for the active organization's shared local endpoint. */
  sharedEndpoints?: SharedEndpointStore;
  /** Validates per-sandbox HMAC tokens (the sandbox-facing credential endpoint). */
  vault: CredentialVault;
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
   * Per-agent integration grants (LOCAL / self-host profile only). Present ONLY
   * when this host is NOT gateway-fronted — a managed cloud pod leaves it unset so
   * the gateway that fronts it stays the single owner of grant policy. Absent →
   * the grant routes 404 (client reads that as "grants unsupported") and the
   * sandbox proxy enforces nothing.
   */
  integrationGrants?: LocalIntegrationGrants;
  /**
   * Per-agent integration action approvals (LOCAL / self-host + managed pods).
   * When present, the sandbox proxy gates each `integration_execute` on user
   * approval (always-allow record OR a one-shot ticket) unless the turn is
   * Autopilot; the user-facing routes below write the approvals. Absent → no
   * gate and the routes 404 ("approvals unsupported").
   */
  actionApprovals?: LocalActionApprovals;
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
  /**
   * Agent Store gateway API base ("install from a link" fetches a shared
   * agent's IR from it). Absent → the route falls back to the
   * `HOUSTON_AGENTSTORE_API_URL` config default.
   */
  agentStoreApiUrl?: string;
  corsOrigin?: string;
}

function applyCors(deps: ControlPlaneDeps, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", deps.corsOrigin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
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

  // Public: health + the v3 meta surface (capabilities are not secrets; the UI
  // reads them before sign-in to shape itself).
  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }
  if (method === "GET" && path === "/v1/version") {
    return json(res, 200, {
      engine: "houston-host",
      protocol: PROTOCOL_VERSION,
      build: null,
      chatHistoryMigrated: deps.chatHistoryMigrated ?? false,
    });
  }
  if (method === "GET" && path === "/v1/capabilities") {
    return json(res, 200, deps.capabilities);
  }
  // pi-ai's full static model catalog (every runnable provider + model), the
  // SAME on every deployment. Static + not user-scoped, so it rides the public
  // meta surface next to capabilities — the picker/AI-Models tab read it to
  // shape themselves.
  if (handleCatalog(method, path, res)) return;

  // Sandbox-facing credential serve (HMAC sandbox token, not a user JWT).
  if (await handleSandboxCredential(deps, method, path, url, req, res)) return;
  // Runtime-facing integration proxy (HMAC sandbox token, not a user JWT).
  if (await handleSandboxIntegrations(deps, method, path, url, req, res))
    return;
  // Runtime-facing custom-integration setup (detect/add; HMAC sandbox token).
  if (await handleSandboxCustomIntegrations(deps, method, path, url, req, res))
    return;

  // Everything past here is authenticated.
  const userId = await principal(deps, req, url);
  if (!userId) return json(res, 401, { error: "unauthorized" });

  // The global reactivity stream (SSE): this user's domain-change events only.
  // Long-lived — do not fall through, and never end the response here.
  if (method === "GET" && path === "/v1/events") {
    if (!deps.events) return json(res, 503, { error: "events not configured" });
    return handleEventStream(deps.events, userId, res, (cb) =>
      req.on("close", cb),
    );
  }

  if (
    deps.mountAdmin &&
    (await deps.mountAdmin(userId, method, path, url, req, res))
  )
    return;

  // "Send feedback" from the web build: same payload the desktop files to Linear
  // via Tauri, fronted here so the browser never holds the Linear key. Errors
  // surface as real statuses — the dialog shows them (beta policy: no silent loss).
  if (path === "/feedback" && method === "POST") {
    if (!deps.feedback)
      return json(res, 503, { error: "feedback intake not configured" });
    let payload: FeedbackPayload;
    try {
      payload = parseFeedbackPayload(await readJson(req));
    } catch (err) {
      // An oversized body is a 413 (mapped by the top-level handler), not a
      // malformed-payload 400 — let it propagate rather than mislabel it.
      if (err instanceof BodyTooLargeError) throw err;
      return json(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return json(res, 200, { id: await deps.feedback.send(payload, userId) });
  }

  // User-level resources (workspaces, preferences) — no agent in the path.
  // Marketplace reads (skills.sh search/popular, GitHub repo discovery) also
  // answer top-level for direct API callers; the shipped clients call them
  // agent-scoped (skills-remote.ts) so the hosted gateway can proxy them.
  if (await handleSkillsDirectory(method, path, req, res)) return;
  if (await handleAccount(deps, userId, method, path, req, res)) return;
  if (await handlePortableAccount(deps, userId, method, path, req, res)) return;
  if (
    await handlePortableFromStore(
      { apiUrl: deps.agentStoreApiUrl },
      method,
      path,
      req,
      res,
    )
  )
    return;
  // Desktop→cloud migration source listing (HOU-719): every agent across every
  // workspace with its migration manifest. Desktop-local by design — the cloud
  // gateway proxies only agent-scoped routes, so a pod never serves this.
  if (await handleMigrationSource(deps, userId, method, path, res)) return;
  if (await handleAgentConfigs(deps, userId, method, path, req, res)) return;
  // Custom-integration definitions — BEFORE the generic provider routes, whose
  // `/v1/integrations/:provider/*` catch-all would 404 these subpaths.
  if (await handleCustomIntegrations(deps, method, path, req, res)) return;
  if (await handleIntegrations(deps, userId, method, path, req, res)) return;
  if (await handleIntegrationGrants(deps, userId, method, path, req, res))
    return;
  if (await handleActionApprovals(deps, userId, method, path, req, res)) return;
  // Pre-agent provider connect (first-run onboarding): a hidden setup runtime
  // runs the OAuth so the user can connect their AI before any agent exists.
  if (await handleSetupRuntime(deps, userId, method, path, url, req, res))
    return;

  // Pod trigger delivery (C9) — matched before the generic per-agent dispatch
  // (the runtime has no trigger routes). The Go control plane POSTs external
  // events here for a managed pod; the pod fires the matching routine.
  if (await handleTriggerEvents(deps, userId, method, path, req, res)) return;

  if (await handleAgents(deps, userId, method, path, url, req, res)) return;

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
    handle(counted, req, res).catch((err) => {
      // An over-cap body maps to 413 (Payload Too Large) with its own clean
      // message; everything else is a 500. Close the connection on 413: capping
      // the body leaves unread bytes on the socket that would poison keep-alive.
      const tooLarge = err instanceof BodyTooLargeError;
      const message = err instanceof Error ? err.message : String(err);
      try {
        if (!res.headersSent) {
          json(
            res,
            tooLarge ? 413 : 500,
            { error: message },
            tooLarge ? { Connection: "close" } : {},
          );
        } else if (!res.writableEnded) res.end();
      } catch {
        // The socket was already torn down while aborting the oversized body —
        // there is nothing left to respond on.
      }
    });
  });
}
