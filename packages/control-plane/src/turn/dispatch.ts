import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConversationSummary } from "@houston/runtime-client";
import type { Agent, Workspace } from "../domain/types";
import {
  conversationKey,
  json,
  prefixFor,
  PROVIDER,
  PROVIDER_NAME,
  readJson,
  readSettings,
  type TurnDeps,
} from "./deps";
import { startTurn } from "./start-turn";
import { handleFileRequest } from "./files";

/**
 * The cloudrun dispatch: serves the SAME /agents/:id/* wire surface the GKE
 * proxy serves, but against per-turn Cloud Run + object storage — the web
 * client cannot tell the difference. Turns become one internal POST /turn to
 * the runtime, piped through the relay; reads come straight from object
 * storage; connect runs in the control plane (see connect.ts).
 */
export async function dispatchCloudrun(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const prefix = prefixFor(ws, agent);

  // Files browser (list/read/rename/delete/folder) against the GCS workspace.
  if (rest === "files" || rest.startsWith("files/")) {
    const query = new URL(req.url || "", "http://control-plane.local").searchParams;
    if (await handleFileRequest(deps, prefix, method, rest, req, res, query)) return;
    return json(res, 404, { error: "not found" });
  }

  if (method === "GET" && rest === "conversations") {
    const out: ConversationSummary[] = [];
    for (const key of await deps.objects.list(`${prefix}/data/conversations`)) {
      if (!key.endsWith(".json")) continue;
      const raw = await deps.objects.readText(key);
      if (!raw) continue;
      const conv = JSON.parse(raw) as ConversationSummary & { messages: { content: string }[] };
      const last = conv.messages[conv.messages.length - 1];
      out.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: last?.content.slice(0, 80),
      });
    }
    return json(res, 200, out.sort((a, b) => b.updatedAt - a.updatedAt));
  }

  const conv = rest.match(/^conversations\/([^/]+)\/(messages|events|cancel)$/);
  if (conv) {
    const cid = decodeURIComponent(conv[1]!);
    const action = conv[2]!;

    if (method === "GET" && action === "messages") {
      const raw = await deps.objects.readText(conversationKey(prefix, cid));
      if (!raw) return json(res, 404, { error: "conversation not found" });
      const c = JSON.parse(raw) as { id: string; title: string; messages: unknown[] };
      return json(res, 200, { id: c.id, title: c.title, messages: c.messages });
    }

    // Subscribe to this conversation's live events. Mirrors the runtime's SSE
    // contract exactly: a `sync` catch-up frame, then live frames, heartbeats.
    if (method === "GET" && action === "events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      const key = `${agent.id}/${cid}`;
      const send = (type: string, data: unknown) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };
      send("sync", deps.relay.snapshot(key));
      const unsub = deps.relay.subscribe(key, (e) => send(e.type, e.data));
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(": hb\n\n");
      }, 15_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        unsub();
        res.end();
      });
      return;
    }

    if (method === "POST" && action === "cancel") {
      deps.relay.cancel(agent.id);
      return json(res, 200, { ok: true });
    }

    if (method === "POST" && action === "messages") {
      const body = await readJson(req);
      if (!body.text || typeof body.text !== "string") {
        return json(res, 400, { error: "missing 'text'" });
      }
      return startTurn(
        deps,
        ws,
        agent,
        cid,
        body.text,
        typeof body.nonce === "string" ? body.nonce : undefined,
        res,
      );
    }
  }

  if (method === "GET" && rest === "providers") {
    const cred = await deps.credentials.get(ws.id, PROVIDER);
    const settings = await readSettings(deps, prefix);
    return json(res, 200, [
      {
        id: PROVIDER,
        name: PROVIDER_NAME,
        configured: !!cred,
        isActive: !!cred,
        activeModel: settings.models?.[PROVIDER] ?? deps.codexModels[0],
        models: deps.codexModels,
      },
    ]);
  }

  if (method === "PUT" && rest === "settings") {
    const body = await readJson(req);
    const settings = await readSettings(deps, prefix);
    if (typeof body.activeProvider === "string") settings.activeProvider = body.activeProvider;
    if (typeof body.model === "string") {
      settings.models = { ...settings.models, [PROVIDER]: body.model };
    }
    await deps.objects.writeText(`${prefix}/data/settings.json`, JSON.stringify(settings));
    return json(res, 200, settings);
  }

  if (method === "GET" && rest === "auth/status") {
    const cred = await deps.credentials.get(ws.id, PROVIDER);
    const login = deps.connect.status(ws.id);
    return json(res, 200, {
      providers: [{ provider: PROVIDER, name: PROVIDER_NAME, configured: !!cred, login }],
      activeProvider: cred ? PROVIDER : null,
    });
  }

  const auth = rest.match(/^auth\/([^/]+)\/(login|logout)$/);
  if (auth && method === "POST") {
    if (auth[1] !== PROVIDER) {
      return json(res, 400, { error: `cloud agents support only ${PROVIDER}` });
    }
    if (auth[2] === "login") return json(res, 200, await deps.connect.start(ws.id));
    await deps.credentials.remove(ws.id, PROVIDER);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "not found" });
}
