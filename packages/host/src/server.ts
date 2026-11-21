import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { ControlPlaneDeps } from "./control-plane-deps";
import { attachViewCapture, viewForPath } from "./docs/view-capture";
import type { UserId } from "./domain/types";
import { AgentRenamingError, LauncherClosedError } from "./ports";
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
export { healthBody } from "./routes/meta";

function applyCors(deps: ControlPlaneDeps, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", deps.corsOrigin || "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Houston-App-Version, Content-Range, X-GUploader-No-308",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Retry-After, X-Houston-Page-Count, Range, X-HTTP-Status-Code-Override",
  );
}

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
  if (await dispatchPreAuth(entry)) return;

  const userId = await principal(deps, req, url);
  if (!userId) return json(res, 401, { error: "unauthorized" });
  if (await handleStoreFenceGate(deps, method, path, res, "authenticated")) {
    return;
  }
  rememberAddressedAgent(deps, path);

  const authenticated = { ...entry, userId };
  if (await dispatchUser(authenticated)) return;
  if (await dispatchAgent(authenticated)) return;

  return json(res, 404, { error: "not found" });
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createControlPlaneServer(deps: ControlPlaneDeps): Server {
  let agentRequests = 0;
  let agentWrites = 0;
  const counted: ControlPlaneDeps = {
    ...deps,
    agentRequestCount: () => agentRequests,
    agentWriteCount: () => agentWrites,
  };
  return createServer((req, res) => {
    const path = (req.url || "/").split("?")[0] ?? "";
    let writeDone: (() => void) | undefined;
    if (path === "/agents" || path.startsWith("/agents/")) {
      agentRequests++;
      res.once("close", () => {
        agentRequests--;
      });
      if (!READ_METHODS.has((req.method ?? "GET").toUpperCase())) {
        agentWrites++;
        let open = 2;
        writeDone = () => {
          if (--open === 0) agentWrites--;
        };
        res.once("close", writeDone);
      }
    }
    if (deps.viewSink && (req.method ?? "GET").toUpperCase() === "GET") {
      const view = viewForPath(path);
      if (view) {
        attachViewCapture(res, (body) =>
          deps.viewSink?.(view.agentId, view.family, body),
        );
      }
    }
    handle(counted, req, res)
      .catch((err) => {
        const tooLarge = err instanceof BodyTooLargeError;
        const unavailable =
          err instanceof LauncherClosedError ||
          err instanceof AgentRenamingError;
        const message = err instanceof Error ? err.message : String(err);
        try {
          if (!res.headersSent) {
            if (unavailable) {
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
        } catch {}
      })
      .finally(() => writeDone?.());
  });
}
