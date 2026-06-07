import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { config } from "../config";
import {
  getAuthStatus,
  startAnthropicLogin,
  completeAnthropicLogin,
  logoutAnthropic,
} from "../auth/anthropic-login";
import { runTurn, cancelTurn } from "../session/chat";
import { getHistory, listConversations } from "../store/conversations";
import { applyCors } from "./cors";
import { openSSE } from "./sse";

const INDEX_HTML = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

function json(res: ServerResponse, status: number, body: unknown) {
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

/** Bearer-token check. Empty config.token => open (local dev). */
function authorized(req: IncomingMessage, url: URL): boolean {
  if (!config.token) return true;
  if (req.headers.authorization === `Bearer ${config.token}`) return true;
  return url.searchParams.get("token") === config.token;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || "/", `http://${config.host}:${config.port}`);
  const path = url.pathname;
  const method = req.method || "GET";

  // Public: test page + health + version.
  if (method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(INDEX_HTML);
  }
  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok", version: config.version });
  }
  if (method === "GET" && path === "/version") {
    return json(res, 200, { engine: config.version, protocol: 1 });
  }

  if (!authorized(req, url)) return json(res, 401, { error: "unauthorized" });

  // --- Auth (Claude Code / Anthropic subscription) ---
  if (method === "GET" && path === "/auth/status") {
    return json(res, 200, getAuthStatus());
  }
  if (method === "POST" && path === "/auth/anthropic/login") {
    try {
      return json(res, 200, await startAnthropicLogin());
    } catch (e) {
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (method === "POST" && path === "/auth/anthropic/login/complete") {
    const { code } = await readJson(req);
    try {
      completeAnthropicLogin(String(code || ""));
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (method === "POST" && path === "/auth/anthropic/logout") {
    logoutAnthropic();
    return json(res, 200, { ok: true });
  }

  // --- Conversations ---
  if (method === "GET" && path === "/conversations") {
    return json(res, 200, listConversations());
  }

  const convMatch = path.match(/^\/conversations\/([^/]+)\/(messages|cancel)$/);
  if (convMatch) {
    const id = decodeURIComponent(convMatch[1]);
    const action = convMatch[2];

    if (method === "GET" && action === "messages") {
      const history = getHistory(id);
      return history
        ? json(res, 200, history)
        : json(res, 404, { error: "conversation not found" });
    }

    if (method === "POST" && action === "cancel") {
      await cancelTurn(id);
      return json(res, 200, { ok: true });
    }

    // POST messages -> stream the turn over SSE
    if (method === "POST" && action === "messages") {
      const { text } = await readJson(req);
      if (!text || typeof text !== "string") {
        return json(res, 400, { error: "missing 'text'" });
      }
      const sse = openSSE(res);
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });
      try {
        await runTurn(id, text, (e) => {
          if (!aborted) sse.send(e.type, e.data);
        });
      } catch (e) {
        sse.send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        sse.close();
      }
      return;
    }
  }

  return json(res, 404, { error: "not found" });
}

export function startServer() {
  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error("[server] unhandled:", e);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else if (!res.writableEnded) res.end();
    });
  });
  server.listen(config.port, config.host, () => {
    console.log(`\nhouston-engine listening on http://${config.host}:${config.port}`);
    console.log(`  workspace: ${config.workspaceDir}`);
    console.log(`  data dir:  ${config.dataDir}`);
    console.log(`  model:     ${config.model}`);
    console.log(`  auth:      ${config.token ? "bearer token required" : "open (local dev)"}`);
    console.log(`  cors:      ${config.corsOrigin}`);
    console.log(`\nOpen http://${config.host}:${config.port} to connect Claude and chat.\n`);
  });
  return server;
}
