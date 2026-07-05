import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { type Capabilities, PROTOCOL_VERSION } from "@houston/protocol";
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
import {
  type AgentConfigsDeps,
  handleAgentConfigs,
} from "./routes/agent-configs";
import { handleAgents } from "./routes/agents";
import { handleSandboxCredential } from "./routes/credential";
import { handleEventStream } from "./routes/events-stream";
import { bearer, json, readJson } from "./routes/http";
import { handleIntegrationGrants } from "./routes/integration-grants";
import {
  handleIntegrations,
  type IntegrationDeps,
} from "./routes/integrations";
import { handleSandboxIntegrations } from "./routes/integrations-sandbox";
import { handlePortableAccount } from "./routes/portable";
import { handleSetupRuntime } from "./routes/setup-runtime";
import { handleSkillsDirectory } from "./routes/skills-directory";
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
   * Per-agent integration grants (LOCAL / self-host profile only). Present ONLY
   * when this host is NOT gateway-fronted — a managed cloud pod leaves it unset so
   * the gateway that fronts it stays the single owner of grant policy. Absent →
   * the grant routes 404 (client reads that as "grants unsupported") and the
   * sandbox proxy enforces nothing.
   */
  integrationGrants?: LocalIntegrationGrants;
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

  // Sandbox-facing credential serve (HMAC sandbox token, not a user JWT).
  if (await handleSandboxCredential(deps, method, path, url, req, res)) return;
  // Runtime-facing integration proxy (HMAC sandbox token, not a user JWT).
  if (await handleSandboxIntegrations(deps, method, path, url, req, res))
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
      return json(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return json(res, 200, { id: await deps.feedback.send(payload, userId) });
  }

  // User-level resources (workspaces, preferences) — no agent in the path.
  // Marketplace reads (skills.sh search/popular, GitHub repo discovery) are
  // user-scoped too: browsing has no agent yet; only installs are per-agent.
  if (await handleSkillsDirectory(method, path, req, res)) return;
  if (await handleAccount(deps, userId, method, path, req, res)) return;
  if (await handlePortableAccount(deps, userId, method, path, req, res)) return;
  if (await handleAgentConfigs(deps, userId, method, path, req, res)) return;
  if (await handleIntegrations(deps, userId, method, path, req, res)) return;
  if (await handleIntegrationGrants(deps, userId, method, path, req, res))
    return;
  // Pre-agent provider connect (first-run onboarding): a hidden setup runtime
  // runs the OAuth so the user can connect their AI before any agent exists.
  if (await handleSetupRuntime(deps, userId, method, path, url, req, res))
    return;

  if (await handleAgents(deps, userId, method, path, url, req, res)) return;

  return json(res, 404, { error: "not found" });
}

/** Build the frontend-facing host API server. */
export function createControlPlaneServer(deps: ControlPlaneDeps): Server {
  return createServer((req, res) => {
    handle(deps, req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) json(res, 500, { error: message });
      else if (!res.writableEnded) res.end();
    });
  });
}
