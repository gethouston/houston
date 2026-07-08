import { createServer } from "node:http";
import { primeAnthropicCredential } from "../backends/claude/credential-status";
import { config } from "../config";
import { anyTurnRunning } from "../session/bus";
import { handleConversationRoute } from "./conversation-routes";
import { applyCors } from "./cors";
import { handleGenerateRoute } from "./generate-route";
import {
  authorized,
  json,
  type RouteContext,
  routeContext,
} from "./http-helpers";
import { handleProviderRoute } from "./provider-routes";

async function handle(ctx: RouteContext) {
  applyCors(ctx.req, ctx.res);
  if (ctx.method === "OPTIONS") {
    ctx.res.writeHead(204);
    ctx.res.end();
    return;
  }

  if (ctx.method === "GET" && ctx.path === "/health") {
    json(ctx.res, 200, { status: "ok", version: config.version });
    return;
  }
  if (ctx.method === "GET" && ctx.path === "/busy") {
    json(ctx.res, 200, { busy: anyTurnRunning() });
    return;
  }
  if (ctx.method === "GET" && ctx.path === "/version") {
    json(ctx.res, 200, { engine: config.version, protocol: 2 });
    return;
  }

  if (!authorized(ctx)) {
    json(ctx.res, 401, { error: "unauthorized" });
    return;
  }
  if (await handleProviderRoute(ctx)) return;
  if (await handleConversationRoute(ctx)) return;
  if (await handleGenerateRoute(ctx)) return;

  json(ctx.res, 404, { error: "not found" });
}

export function createRuntimeServer() {
  return createServer((req, res) => {
    handle(routeContext(req, res)).catch((e) => {
      console.error("[server] unhandled:", e);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else if (!res.writableEnded) res.end();
    });
  });
}

export function startServer() {
  // Warm the anthropic shared-dir credential probe so the turn-time sync path
  // (`activeProvider`) sees a connected credential even before the first
  // /auth/status poll. Fire-and-forget; failures self-log (never connected).
  primeAnthropicCredential();
  const server = createRuntimeServer();
  server.listen(config.port, config.host, () => {
    console.info("runtime listening", {
      auth: config.token ? "bearer_token_required" : "open_local_dev",
      cors: config.corsOrigin,
      dataDir: config.dataDir,
      mode: "server",
      model: config.model,
      url: `http://${config.host}:${config.port}`,
      workspace: config.workspaceDir,
    });
  });
  return server;
}
