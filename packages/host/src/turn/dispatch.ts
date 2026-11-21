import type { IncomingMessage, ServerResponse } from "node:http";
import { parseMentions, parseMissionTitle } from "@houston/protocol";
import type { ConversationSummary } from "@houston/runtime-client";
import type { Agent, Workspace } from "../domain/types";
import { BodyTooLargeError } from "../routes/read-body";
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

export async function dispatchCloudrun(
  deps: TurnDeps,
  ws: Workspace,
  agent: Agent,
  method: string,
  rest: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  preReadBody?: Buffer,
): Promise<void> {
  const prefix = prefixFor(ws, agent);

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
      const cancelled = await deps.relay.cancel(agent.id);
      return json(res, 200, { ok: true, cancelled });
    }

    if (method === "POST" && action === "messages") {
      let body: Record<string, unknown>;
      try {
        body = preReadBody
          ? (JSON.parse(preReadBody.toString("utf8") || "{}") as Record<
              string,
              unknown
            >)
          : await readJson(req);
      } catch (err) {
        if (err instanceof BodyTooLargeError) throw err;
        return json(res, 400, { error: "invalid JSON body" });
      }
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
        typeof body.displayText === "string" ? body.displayText : undefined,
        parseMentions(body.mentions),
        parseMissionTitle(body.missionTitle),
      );
    }
  }

  if (await dispatchProviderRoutes(deps, ws, prefix, method, rest, req, res)) {
    return;
  }

  return json(res, 404, { error: "not found" });
}
