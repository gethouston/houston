import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConversationSummary } from "@houston/runtime-client";
import type { Agent, Workspace } from "../domain/types";
import {
  conversationKey,
  json,
  prefixFor,
  readJson,
  type TurnDeps,
} from "./deps";
import { dispatchProviderRoutes } from "./dispatch-providers";
import { serveConversationEvents } from "./events-route";
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
  url: URL,
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
    const cid = decodeURIComponent(conv[1] ?? "");
    const action = conv[2] ?? "";

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
    // contract exactly: resumable, sequenced frames (see turn/events-route.ts).
    // The agent id rides along so the route can run the dead-pump reaper
    // against the agent's turn lease.
    if (method === "GET" && action === "events") {
      return serveConversationEvents(
        deps.relay,
        agent.id,
        `${agent.id}/${cid}`,
        url,
        req,
        res,
      );
    }

    if (method === "POST" && action === "cancel") {
      // `relay.cancel` already knows whether a turn was in flight on any replica;
      // surface that as `cancelled` so the client can settle a stuck "running"
      // card when there was nothing to abort (orphaned after a restart / a turn
      // that died without a terminal frame). Previously this boolean was dropped.
      const cancelled = await deps.relay.cancel(agent.id);
      return json(res, 200, { ok: true, cancelled });
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
        // Presentation-only bubble text; forwarded to the runtime, which
        // persists it beside the user message. The model still runs on `text`.
        typeof body.displayText === "string" ? body.displayText : undefined,
      );
    }
  }

  // Providers, settings, auth status/login/logout (see dispatch-providers.ts).
  if (await dispatchProviderRoutes(deps, ws, prefix, method, rest, req, res)) {
    return;
  }

  return json(res, 404, { error: "not found" });
}
