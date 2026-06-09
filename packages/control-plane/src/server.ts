import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Agent, UserId } from "./domain/types";
import type {
  CredentialStore,
  CredentialVault,
  ForwardRequest,
  SandboxEndpoint,
  SandboxManager,
  TokenVerifier,
  WorkspaceStore,
} from "./ports";
import { canUseAgent } from "./domain/access";
import { isExpiring, refreshCredential } from "./credentials/refresh";
import type { ClusterReader } from "./admin/cluster";
import type { AutopilotRates, BillingActualsReader } from "./admin/billing";
import { buildBillingReport, buildOverview, type ActualsStatus } from "./admin/overview";

/**
 * Forwards an authorized per-agent request to its sandbox runtime and streams the
 * reply back — one transparent reverse proxy over the runtime's whole contract
 * (chat, SSE events, provider device-code login, settings). Concrete impl is
 * wired in `main.ts` (proxy/route.ts). Kept as an interface so the server depends
 * on a shape, not a module.
 */
export interface SandboxRouter {
  forward(endpoint: SandboxEndpoint, request: ForwardRequest, res: ServerResponse): Promise<void>;
}

/**
 * Wiring for the operator dashboard (`/admin/*`). Absent → the admin API does not
 * exist (404). Present but `adminUserIds` empty → still off (it never falls open).
 */
export interface AdminDeps {
  /** Supabase user ids (JWT `sub`) allowed to read the cross-tenant views. */
  adminUserIds: string[];
  /** Cluster-wide read of managed agent pods + PVCs. */
  cluster: ClusterReader;
  /** Authoritative billed cost; null when BigQuery export isn't configured. */
  billing: BillingActualsReader | null;
  /** USD rates the live cost estimate multiplies against. */
  rates: AutopilotRates;
}

export interface ControlPlaneDeps {
  verifier: TokenVerifier;
  store: WorkspaceStore;
  sandboxes: SandboxManager;
  router: SandboxRouter;
  /** Connect-once: the one subscription credential per workspace, served to its sandboxes. */
  credentials: CredentialStore;
  /** Validates per-sandbox HMAC tokens (the sandbox-facing credential endpoint). */
  vault: CredentialVault;
  /** Operator dashboard wiring; omit to disable the `/admin/*` API entirely. */
  admin?: AdminDeps;
  corsOrigin?: string;
}

/** Parse the ?days= window for the billing view: default 30, clamped to [1, 180]. */
function billingDays(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 30; // Number(null/"") is 0 — guard the absent case.
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(180, Math.max(1, Math.floor(n)));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(buf);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/** The caller's bearer, from the Authorization header or a ?token= fallback (SSE). */
function bearer(req: IncomingMessage, url: URL): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice("Bearer ".length);
  return url.searchParams.get("token");
}

function applyCors(deps: ControlPlaneDeps, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", deps.corsOrigin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

/** Resolve the caller to a verified Supabase user id, or null if unauthenticated. */
async function principal(deps: ControlPlaneDeps, req: IncomingMessage, url: URL): Promise<UserId | null> {
  const token = bearer(req, url);
  if (!token) return null;
  const verified = await deps.verifier.verify(token);
  return verified?.userId ?? null;
}

type AgentAuthz = { ok: true; agent: Agent } | { ok: false; status: number; reason: string };

/** Load an agent + its workspace and run the ownership check in one place. */
async function authorizeAgent(deps: ControlPlaneDeps, userId: UserId, agentId: string): Promise<AgentAuthz> {
  const agent = await deps.store.getAgent(agentId);
  const workspace = agent ? await deps.store.getWorkspace(agent.workspaceId) : null;
  const access = canUseAgent({ userId, agent, workspace });
  if (!access.ok) {
    return { ok: false, status: access.reason === "agent not found" ? 404 : 403, reason: access.reason };
  }
  if (!agent) return { ok: false, status: 404, reason: "agent not found" }; // narrows the type
  return { ok: true, agent };
}

async function handle(deps: ControlPlaneDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  applyCors(deps, res);
  const method = req.method || "GET";
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://control-plane.local");
  const path = url.pathname;

  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }

  // Sandbox-facing (connect-once): an agent serves a FRESH subscription token from
  // its workspace's central credential. Authenticated by the per-sandbox HMAC token
  // (NOT a user JWT), refreshed centrally here so no sandbox ever holds/rotates the
  // refresh token. Sits before the user-principal gate.
  if (method === "GET" && path === "/sandbox/credential") {
    const sbToken = bearer(req, url);
    const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
    if (!claim) return json(res, 401, { error: "unauthorized" });
    const provider = url.searchParams.get("provider") || "openai-codex";
    let cred = await deps.credentials.get(claim.workspaceId, provider);
    if (!cred) return json(res, 404, { error: "workspace not connected" });
    if (isExpiring(cred)) {
      cred = await refreshCredential(cred);
      await deps.credentials.put(cred);
    }
    // Full pi auth.json entry: the ChatGPT backend needs accountId, so the runtime
    // can write a complete file rather than just an injected key.
    return json(res, 200, {
      provider: cred.provider,
      access: cred.accessToken,
      refresh: cred.refreshToken,
      expires: cred.expiresAt,
      accountId: cred.accountId ?? null,
    });
  }

  // Everything past here is authenticated.
  const userId = await principal(deps, req, url);
  if (!userId) return json(res, 401, { error: "unauthorized" });

  // Operator dashboard (cross-tenant: every user's pods + spend). Gated by an
  // explicit user-id allowlist. Disabled → 404 (no such route); enabled but the
  // caller isn't an operator → 403. It never falls open.
  if (path === "/admin/overview" || path === "/admin/billing") {
    const admin = deps.admin;
    if (!admin || admin.adminUserIds.length === 0) return json(res, 404, { error: "not found" });
    if (!admin.adminUserIds.includes(userId)) return json(res, 403, { error: "forbidden" });
    if (method !== "GET") return json(res, 405, { error: "method not allowed" });

    const [workspaces, agents, snapshot] = await Promise.all([
      deps.store.listWorkspaces(),
      deps.store.listAllAgents(),
      admin.cluster.snapshot(),
    ]);
    const now = Date.now();
    const overview = buildOverview(workspaces, agents, snapshot, admin.rates, now);

    if (path === "/admin/overview") return json(res, 200, overview);

    // /admin/billing — overview's per-user estimate, plus BigQuery actuals if wired.
    // A BigQuery failure does NOT sink the response: the estimate still renders and
    // the real error surfaces to the operator as actualsStatus="error" + message.
    const days = billingDays(url.searchParams.get("days"));
    let actuals = null;
    let actualsStatus: ActualsStatus = "not-configured";
    let actualsError: string | undefined;
    if (admin.billing) {
      try {
        actuals = await admin.billing.query(days);
        actualsStatus = "ok";
      } catch (err) {
        actualsStatus = "error";
        actualsError = err instanceof Error ? err.message : String(err);
      }
    }
    return json(res, 200, buildBillingReport(overview, admin.rates, actuals, actualsStatus, actualsError, now));
  }

  // The user's own agents — their personal workspace, auto-provisioned on first hit.
  if (path === "/agents" && method === "GET") {
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    return json(res, 200, await deps.store.listAgents(ws.id));
  }
  if (path === "/agents" && method === "POST") {
    const { name } = await readJson(req);
    if (!name || typeof name !== "string") return json(res, 400, { error: "missing 'name'" });
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    return json(res, 201, await deps.store.createAgent({ workspaceId: ws.id, name }));
  }

  // Rename / delete a single agent (owner-only — in personal mode, everyone for their own).
  const single = path.match(/^\/agents\/([^/]+)$/);
  if (single) {
    const agentId = single[1];
    if (!agentId) return json(res, 404, { error: "not found" });
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) return json(res, authz.status, { error: authz.reason });

    if (method === "PATCH") {
      const { name } = await readJson(req);
      if (!name || typeof name !== "string") return json(res, 400, { error: "missing 'name'" });
      return json(res, 200, await deps.store.renameAgent(agentId, name));
    }
    if (method === "DELETE") {
      // Tear the sandbox down first (so a failure is retryable with the record intact),
      // then drop the record. Errors surface — never a silent orphan.
      await deps.sandboxes.destroy(agentId, { dropVolume: true });
      await deps.store.deleteAgent(agentId);
      return json(res, 200, { ok: true });
    }
  }

  // Capture (connect-once): after the user connects an agent's subscription, pull
  // the credential out of that agent's runtime and store it for the WHOLE workspace,
  // so every agent (existing + new) serves from it. Must precede the generic proxy.
  const capture = path.match(/^\/agents\/([^/]+)\/credential\/capture$/);
  if (capture && method === "POST") {
    const agentId = capture[1];
    if (!agentId) return json(res, 404, { error: "not found" });
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) return json(res, authz.status, { error: authz.reason });

    const endpoint = await deps.sandboxes.ensureAwake(authz.agent);
    const exp = await fetch(`${endpoint.baseUrl}/auth/export`, {
      headers: { Authorization: `Bearer ${endpoint.token}` },
    });
    if (!exp.ok) {
      return json(res, 502, { error: "could not read agent credential", detail: await exp.text().catch(() => "") });
    }
    const c = (await exp.json()) as {
      provider?: string;
      access?: string;
      refresh?: string;
      expires?: number;
      accountId?: string;
    };
    if (!c.provider || !c.access || !c.refresh || typeof c.expires !== "number") {
      return json(res, 400, { error: "agent is not connected yet" });
    }
    await deps.credentials.put({
      workspaceId: authz.agent.workspaceId,
      provider: c.provider,
      accessToken: c.access,
      refreshToken: c.refresh,
      accountId: c.accountId,
      expiresAt: c.expires,
    });
    return json(res, 200, { ok: true, provider: c.provider });
  }

  // Transparent, authorizing reverse proxy: /agents/:agentId/<anything> → the
  // agent's sandbox runtime. The frontend points its runtime client at
  // `${controlPlaneUrl}/agents/${agentId}`, so chat turns, the SSE event stream,
  // and the provider device-code connect flow all reach the runtime under one
  // ownership-checked, sandbox-ensuring proxy.
  const proxy = path.match(/^\/agents\/([^/]+)\/(.+)$/);
  if (proxy) {
    const agentId = proxy[1];
    const rest = proxy[2];
    if (!agentId || !rest) return json(res, 404, { error: "not found" });

    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) return json(res, authz.status, { error: authz.reason });

    // First touch spins the pod up (a cold start can take a minute or two).
    const endpoint = await deps.sandboxes.ensureAwake(authz.agent);

    // Collect the raw body for non-GET so arbitrary payloads ({text}, {code},
    // {activeProvider}) pass through untouched. Strip the caller's `token` auth
    // param so the user's JWT is never leaked downstream to the pod.
    let body: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      body = Buffer.concat(chunks);
    }
    const params = new URLSearchParams(url.search);
    params.delete("token");
    const qs = params.toString();

    return deps.router.forward(
      endpoint,
      {
        method,
        path: `/${rest}`,
        search: qs ? `?${qs}` : "",
        contentType: req.headers["content-type"] ?? null,
        body,
      },
      res,
    );
  }

  return json(res, 404, { error: "not found" });
}

/** Build the frontend-facing control-plane API server. (The credential proxy is a separate listener.) */
export function createControlPlaneServer(deps: ControlPlaneDeps): Server {
  return createServer((req, res) => {
    handle(deps, req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) json(res, 500, { error: message });
      else if (!res.writableEnded) res.end();
    });
  });
}
