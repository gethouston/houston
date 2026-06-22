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

  // NB: `files*` never reaches here — the host intercepts it upstream in
  // routes/agents.ts (handleFiles) for every profile, so cloud + local share
  // one Files-tab implementation. See turn/files.ts.

  if (method === "GET" && rest === "conversations") {
    const out: ConversationSummary[] = [];
    for (const key of await deps.vfs.list(`${prefix}/data/conversations`)) {
      if (!key.endsWith(".json")) continue;
      const raw = await deps.vfs.readText(key);
      if (!raw) continue;
      const conv = JSON.parse(raw) as ConversationSummary & {
        messages: { content: string }[];
      };
      const last = conv.messages[conv.messages.length - 1];
      out.push({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: last?.content.slice(0, 80),
      });
    }
    return json(
      res,
      200,
      out.sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }

  const conv = rest.match(/^conversations\/([^/]+)\/(messages|events|cancel)$/);
  if (conv) {
    const cid = decodeURIComponent(conv[1]!);
    const action = conv[2]!;

    if (method === "GET" && action === "messages") {
      const raw = await deps.vfs.readText(conversationKey(prefix, cid));
      if (!raw) return json(res, 404, { error: "conversation not found" });
      const c = JSON.parse(raw) as {
        id: string;
        title: string;
        messages: unknown[];
      };
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
        if (!res.writableEnded)
          res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };
      // Subscribe FIRST (buffering), then read the snapshot, then flush the
      // buffer through the (turnId, seq) watermark: frames the snapshot
      // already folded in are dropped, frames it hasn't are delivered. No
      // gap, no duplicates — even though the snapshot read is async.
      let live = false;
      let snapTurn = "";
      let snapSeq = 0;
      const buffered: {
        e: import("@houston/runtime-client").WireEvent;
        turnId: string;
        seq: number;
      }[] = [];
      const deliver = (
        e: { type: string; data: unknown },
        turnId: string,
        seq: number,
      ) => {
        if (turnId === snapTurn && seq <= snapSeq) return; // already in the sync frame
        send(e.type, e.data);
      };
      const unsub = deps.relay.subscribe(key, (e, meta) => {
        if (live) deliver(e, meta.turnId, meta.seq);
        else buffered.push({ e, ...meta });
      });
      const snap = await deps.relay.snapshot(key);
      snapTurn = snap.turnId;
      snapSeq = snap.seq;
      send("sync", snap.snapshot);
      for (const b of buffered) deliver(b.e, b.turnId, b.seq);
      live = true;
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
      await deps.relay.cancel(agent.id);
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
    if (typeof body.activeProvider === "string")
      settings.activeProvider = body.activeProvider;
    if (typeof body.model === "string") {
      settings.models = { ...settings.models, [PROVIDER]: body.model };
    }
    await deps.vfs.writeText(
      `${prefix}/data/settings.json`,
      JSON.stringify(settings),
    );
    return json(res, 200, settings);
  }

  if (method === "GET" && rest === "auth/status") {
    const cred = await deps.credentials.get(ws.id, PROVIDER);
    const login = await deps.connect.status(ws.id);
    return json(res, 200, {
      providers: [
        { provider: PROVIDER, name: PROVIDER_NAME, configured: !!cred, login },
      ],
      activeProvider: cred ? PROVIDER : null,
    });
  }

  const auth = rest.match(/^auth\/([^/]+)\/(login|logout)$/);
  if (auth && method === "POST") {
    if (auth[1] !== PROVIDER) {
      return json(res, 400, { error: `cloud agents support only ${PROVIDER}` });
    }
    if (auth[2] === "login")
      return json(res, 200, await deps.connect.start(ws.id));
    await deps.credentials.remove(ws.id, PROVIDER);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "not found" });
}
