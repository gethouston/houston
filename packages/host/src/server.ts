import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { ControlPlaneDeps } from "./control-plane-deps";
import { attachViewCapture, viewForPath } from "./docs/view-capture";
import type { UserId } from "./domain/types";
import { LauncherClosedError } from "./ports";
import { bearer, json } from "./routes/http";
import { BodyTooLargeError } from "./routes/read-body";
import { handleStoreFenceGate } from "./routes/store-fence-gate";
import {
  dispatchAgent,
  dispatchPreAuth,
  dispatchUser,
  rememberAddressedAgent,
} from "./server-phases";

export type { MountAdmin } from "./admin-seam";
export type { RuntimeProxy } from "./channel/proxy";
export type { ControlPlaneDeps } from "./control-plane-deps";
// `/health`'s body shape is part of this server's published surface; the route
// that serves it now lives in routes/meta.ts.
export { healthBody } from "./routes/meta";

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

/**
 * The request pipeline: CORS, the pre-auth segment, the 401 wall, then the two
 * authenticated segments. WHICH routes each segment holds, and in what order,
 * is registry/groups.ts's table alone (server-phases.ts walks it).
 */
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
  if (await dispatchPreAuth(entry)) return;

  // Everything past here is authenticated.
  const userId = await principal(deps, req, url);
  if (!userId) return json(res, 401, { error: "unauthorized" });
  if (handleStoreFenceGate(deps, method, path, res, "agents")) return;
  rememberAddressedAgent(deps, path);

  const authenticated = { ...entry, userId };
  if (await dispatchUser(authenticated)) return;
  if (await dispatchAgent(authenticated)) return;

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
