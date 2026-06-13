import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { PROTOCOL_VERSION, type Capabilities } from "@houston/protocol";
import type { UserId, WorkspaceRuntime } from "./domain/types";
import type { CredentialStore, CredentialVault, RuntimeChannel, TokenVerifier, WorkspaceStore } from "./ports";
import { bearer, json, readJson } from "./routes/http";
import { handleSandboxCredential } from "./routes/credential";
import { handleAdmin, type AdminDeps } from "./routes/admin";
import { handleAgents } from "./routes/agents";
import { parseFeedbackPayload, type FeedbackSender } from "./feedback";

export type { AdminDeps } from "./routes/admin";
export type { RuntimeProxy } from "./channel/proxy";

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
  /** What this deployment can do; served at /v1/capabilities for the UI to gate on. */
  capabilities: Capabilities;
  /** Operator dashboard wiring; omit to disable the `/admin/*` API entirely. */
  admin?: AdminDeps;
  /** "Send feedback" intake (web build → Linear); omit and POST /feedback answers 503. */
  feedback?: FeedbackSender;
  corsOrigin?: string;
}

function applyCors(deps: ControlPlaneDeps, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", deps.corsOrigin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

/** Resolve the caller to a verified user id, or null if unauthenticated. */
async function principal(deps: ControlPlaneDeps, req: IncomingMessage, url: URL): Promise<UserId | null> {
  const token = bearer(req, url);
  if (!token) return null;
  const verified = await deps.verifier.verify(token);
  return verified?.userId ?? null;
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

  // Public: health + the v3 meta surface (capabilities are not secrets; the UI
  // reads them before sign-in to shape itself).
  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok" });
  }
  if (method === "GET" && path === "/v1/version") {
    return json(res, 200, { engine: "houston-host", protocol: PROTOCOL_VERSION, build: null });
  }
  if (method === "GET" && path === "/v1/capabilities") {
    return json(res, 200, deps.capabilities);
  }

  // Sandbox-facing credential serve (HMAC sandbox token, not a user JWT).
  if (await handleSandboxCredential(deps, method, path, url, req, res)) return;

  // Everything past here is authenticated.
  const userId = await principal(deps, req, url);
  if (!userId) return json(res, 401, { error: "unauthorized" });

  if (await handleAdmin(deps, userId, method, path, url, req, res)) return;

  // "Send feedback" from the web build: same payload the desktop files to Linear
  // via Tauri, fronted here so the browser never holds the Linear key. Errors
  // surface as real statuses — the dialog shows them (beta policy: no silent loss).
  if (path === "/feedback" && method === "POST") {
    if (!deps.feedback) return json(res, 503, { error: "feedback intake not configured" });
    let payload;
    try {
      payload = parseFeedbackPayload(await readJson(req));
    } catch (err) {
      return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return json(res, 200, { id: await deps.feedback.send(payload, userId) });
  }

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
