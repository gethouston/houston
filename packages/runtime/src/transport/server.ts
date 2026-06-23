import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { listProviders, setSettings } from "../ai/providers";
import {
  completeLogin,
  getAuthStatus,
  logout,
  setApiKey,
  startLogin,
} from "../auth/login";
import { exportCredential, scrubRefreshTokens } from "../auth/serve";
import { config } from "../config";
import { snapshot, subscribe } from "../session/bus";
import {
  cancelTurn,
  disposeConversation,
  ensureProviderForTurn,
  runTurn,
} from "../session/chat";
import { summarizeTitle, titleFromText } from "../session/summarize";
import {
  deleteConversation,
  getHistory,
  listConversations,
  renameConversation,
} from "../store/conversations";
import { applyCors } from "./cors";
import { openSSE } from "./sse";

function json(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(buf);
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
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

  // Public: health + version.
  if (method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok", version: config.version });
  }
  if (method === "GET" && path === "/version") {
    return json(res, 200, { engine: config.version, protocol: 2 });
  }

  if (!authorized(req, url)) return json(res, 401, { error: "unauthorized" });

  // --- Providers & settings ---
  if (method === "GET" && path === "/providers") {
    return json(res, 200, listProviders());
  }
  if (method === "PUT" && path === "/settings") {
    const body = await readJson(req);
    try {
      return json(res, 200, setSettings(body));
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // --- Auth (subscription OAuth: anthropic = Claude, openai-codex = Codex) ---
  if (method === "GET" && path === "/auth/status") {
    return json(res, 200, getAuthStatus());
  }
  // Connect-once: the control plane reads this right after a device-code connect to
  // capture the credential into the workspace's central store. {} when not connected.
  if (method === "GET" && path === "/auth/export") {
    return json(res, 200, exportCredential() ?? {});
  }
  // Gate #2 (connect-once): the control plane calls this right after capture so
  // this sandbox stops holding the user's refresh token. Idempotent.
  if (method === "POST" && path === "/auth/scrub-refresh") {
    return json(res, 200, { ok: true, scrubbed: scrubRefreshTokens() });
  }
  // API-key connect (OpenCode Zen / Go): the user pastes a key, no OAuth dance.
  const apiKeyMatch = path.match(/^\/auth\/([^/]+)\/api-key$/);
  if (method === "POST" && apiKeyMatch) {
    const provider = apiKeyMatch[1];
    try {
      const { key } = await readJson(req);
      setApiKey(provider, String(key || ""));
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const authMatch = path.match(
    /^\/auth\/([^/]+)\/(login|login\/complete|logout)$/,
  );
  if (method === "POST" && authMatch) {
    const provider = authMatch[1];
    const action = authMatch[2];
    try {
      if (action === "login") {
        // `deviceAuth=false` (sent only by the co-located desktop client)
        // selects Codex's browser/loopback login; default true keeps the
        // device-code path for remote webapp clients.
        const deviceAuth = url.searchParams.get("deviceAuth") !== "false";
        return json(res, 200, await startLogin(provider, deviceAuth));
      }
      if (action === "login/complete") {
        const { code } = await readJson(req);
        completeLogin(provider, String(code || ""));
        return json(res, 200, { ok: true });
      }
      logout(provider);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // --- Conversations ---
  if (method === "GET" && path === "/conversations") {
    return json(res, 200, listConversations());
  }

  // Stateless title generation from a posted excerpt — the composer's first
  // message in, a short LLM title out. Distinct from the id-scoped
  // /conversations/:id/title (which titles a stored transcript): the web
  // adapter's summarizeActivity has the message text but no conversation id.
  if (method === "POST" && path === "/title") {
    const { text } = await readJson(req);
    if (typeof text !== "string") {
      return json(res, 400, { error: "missing 'text'" });
    }
    try {
      return json(res, 200, { title: await titleFromText(text) });
    } catch (e) {
      return json(res, 400, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Rename / delete a conversation. Delete also drops the live pi session and
  // its on-disk session history — the conversation is gone, not just hidden.
  const convRootMatch = path.match(/^\/conversations\/([^/]+)$/);
  if (convRootMatch) {
    const id = decodeURIComponent(convRootMatch[1]);
    if (method === "PATCH") {
      const { title } = await readJson(req);
      if (!title || typeof title !== "string") {
        return json(res, 400, { error: "missing 'title'" });
      }
      return renameConversation(id, title)
        ? json(res, 200, { ok: true })
        : json(res, 404, { error: "conversation not found" });
    }
    if (method === "DELETE") {
      await disposeConversation(id, { deleteSessions: true });
      return deleteConversation(id)
        ? json(res, 200, { ok: true })
        : json(res, 404, { error: "conversation not found" });
    }
  }

  const convMatch = path.match(
    /^\/conversations\/([^/]+)\/(messages|events|cancel|title)$/,
  );
  if (convMatch) {
    const id = decodeURIComponent(convMatch[1]);
    const action = convMatch[2];

    if (method === "GET" && action === "messages") {
      const history = getHistory(id);
      return history
        ? json(res, 200, history)
        : json(res, 404, { error: "conversation not found" });
    }

    // Subscribe to this conversation's live events (id-scoped SSE). This is the
    // ONLY event channel: on connect we emit a `sync` frame so a late/reconnecting
    // client catches the current turn, then live-tail. Strictly one conversation.
    if (method === "GET" && action === "events") {
      const sse = openSSE(res);
      // snapshot + subscribe run in the same sync tick (no await between) so no
      // event can slip through the gap between catch-up and live-tail.
      sse.send("sync", snapshot(id));
      const unsub = subscribe(id, (e) => sse.send(e.type, e.data));
      req.on("close", () => {
        unsub();
        sse.close();
      });
      return; // long-lived; do not end the response here
    }

    if (method === "POST" && action === "cancel") {
      // `cancelled` is the honest answer to "was there a live turn to stop?".
      // A `false` (no cached conversation — e.g. after a restart) tells the
      // client the turn is orphaned, so it can settle a stuck "running" card
      // itself rather than waiting on a terminal event that will never come.
      const cancelled = await cancelTurn(id);
      return json(res, 200, { ok: true, cancelled });
    }

    // Generate + persist a short LLM title for the conversation.
    if (method === "POST" && action === "title") {
      try {
        const title = await summarizeTitle(id);
        return title
          ? json(res, 200, { title })
          : json(res, 404, { error: "conversation not found" });
      } catch (e) {
        return json(res, 400, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Start a turn. Fire-and-forget: the turn's events arrive on the events
    // stream above (runTurn never rejects — failures surface as `error` events).
    if (method === "POST" && action === "messages") {
      const { text, nonce, model, effort } = await readJson(req);
      if (!text || typeof text !== "string") {
        return json(res, 400, { error: "missing 'text'" });
      }
      // Sync the workspace credential + confirm a provider BEFORE accepting the
      // turn. A not-connected turn fails THIS request (the client surfaces the
      // error) instead of starting a fire-and-forget turn whose only failure
      // signal is an `error` event that can race the client's SSE subscribe and
      // be lost — which left the chat spinning forever after logout.
      if (!(await ensureProviderForTurn())) {
        return json(res, 409, {
          error: "No provider connected. Connect an AI provider first.",
        });
      }
      // model/effort ride on a routine-fired message (a routine's pin); a normal
      // user message omits them, leaving the session's current model/effort.
      const pin = {
        model: typeof model === "string" ? model : undefined,
        effort: typeof effort === "string" ? effort : undefined,
      };
      void runTurn(
        id,
        text,
        typeof nonce === "string" ? nonce : undefined,
        pin,
      );
      return json(res, 202, { ok: true, id });
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
    console.log(
      `\nhouston-runtime listening on http://${config.host}:${config.port}`,
    );
    console.log(`  workspace: ${config.workspaceDir}`);
    console.log(`  data dir:  ${config.dataDir}`);
    console.log(`  model:     ${config.model}`);
    console.log(
      `  auth:      ${config.token ? "bearer token required" : "open (local dev)"}`,
    );
    console.log(
      `  claude:    ${config.headless ? "headless (paste code)" : "loopback (local)"}`,
    );
    console.log(`  cors:      ${config.corsOrigin}`);
  });
  return server;
}
