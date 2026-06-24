/**
 * Per-agent route dispatch for the fake host: everything under `/agents/:id/*`.
 *
 * Two contracts share this namespace (mirroring the real deployment):
 *  - control-plane host data — activities, routines, skills, agent files
 *    (packages/web/src/engine-adapter/control-plane.ts), and
 *  - the per-agent runtime proxy — providers, auth, settings, and the
 *    conversation stream (packages/runtime-client/src/client.ts), reached at
 *    `/agents/:id/conversations/:cid/*`.
 *
 * The chat turn is the interesting one: the client subscribes to the
 * conversation's SSE stream FIRST, then POSTs the message (fire-and-forget 202).
 * We register the open stream, then push a canned reply (`text` deltas → `usage`
 * → `done`) when the message lands. See translate.ts `streamTurn`.
 */

import { cancelChat, openChatStream, sendMessage } from "./chat";
import { json, noContent } from "./http";
import * as state from "./state";

/** Canned provider list — one connected, active Claude. */
export function providersBody() {
  return [
    {
      id: "anthropic",
      name: "Claude",
      configured: true,
      isActive: true,
      activeModel: "claude-sonnet-4-6",
      models: ["claude-sonnet-4-6", "claude-opus-4-8"],
    },
  ];
}

/** Auth status with an active provider — clears the WebApp connect gate. */
export function authStatusBody() {
  return {
    providers: [
      { provider: "anthropic", name: "Claude", configured: true, login: null },
    ],
    activeProvider: "anthropic",
  };
}

function makeTitle(text: string): string {
  return (
    text.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ") ||
    "New chat"
  );
}

/**
 * Dispatch `/agents/:id/...`. `rest` is the path split AFTER the `agents`
 * segment, already URL-decoded. `body` is the parsed JSON body (or undefined).
 */
export function handleAgents(
  method: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response {
  // /agents
  if (rest.length === 0) {
    if (method === "GET") return json(state.listAgents());
    if (method === "POST")
      return json(state.createAgent(String(body?.name ?? "Agent")));
    return noContent(405);
  }

  const id = rest[0];

  // /agents/:id
  if (rest.length === 1) {
    if (method === "PATCH") {
      const renamed = state.renameAgent(id, String(body?.name ?? ""));
      return renamed
        ? json(renamed)
        : json({ error: { message: "agent not found" } }, 404);
    }
    if (method === "DELETE")
      return state.deleteAgent(id) ? noContent() : json({ error: {} }, 404);
    return noContent(405);
  }

  const sub = rest[1];
  switch (sub) {
    case "activities": {
      if (rest.length === 2) {
        if (method === "GET") return json({ items: state.listActivities(id) });
        if (method === "POST")
          return json(state.createActivity(id, body ?? {}));
        return noContent(405);
      }
      const aid = rest[2];
      if (method === "PATCH") {
        const updated = state.updateActivity(id, aid, body ?? {});
        return updated ? json(updated) : json({ error: {} }, 404);
      }
      if (method === "DELETE") {
        state.deleteActivity(id, aid);
        return noContent();
      }
      return noContent(405);
    }

    case "routines":
    case "routine_runs":
    case "skills":
      if (method === "GET") return json({ items: [] });
      return noContent(); // create/update/delete/run — accepted no-ops

    case "credential":
      return noContent(); // capture / forget

    case "providers":
      return json(providersBody());

    case "settings":
      return json({
        activeProvider: body?.activeProvider ?? "anthropic",
        models: {},
      });

    case "title":
      return json({ title: makeTitle(String(body?.text ?? "")) });

    case "auth": {
      if (rest[2] === "status") return json(authStatusBody());
      const action = rest[3]; // /auth/:provider/login | /logout
      if (action === "login" && rest[4] === "complete")
        return json({ ok: true });
      if (action === "login")
        return json({ kind: "url", url: "https://example.test/connect" });
      if (action === "logout") return json({ ok: true });
      return noContent();
    }

    case "conversations": {
      const cid = rest[2];
      const action = rest[3];
      if (action === "events") return openChatStream(req, id, cid);
      if (action === "messages") {
        if (method === "GET")
          return json({
            id: cid,
            title: "",
            messages: state.getHistory(id, cid),
          });
        if (method === "POST")
          return sendMessage(id, cid, String(body?.text ?? ""));
      }
      if (action === "cancel") {
        cancelChat(id, cid);
        return json({ ok: true });
      }
      return noContent();
    }

    case "agentfile": {
      // Files-first store: `/agents/:id/agentfile/<relPath>`. The board reads +
      // writes `.houston/activity/activity.json` through here.
      const relPath = rest.slice(2).join("/");
      if (method === "GET")
        return json({ content: state.readAgentFile(id, relPath) });
      if (method === "PUT") {
        state.writeAgentFile(id, relPath, String(body?.content ?? ""));
        return noContent();
      }
      return noContent(405);
    }

    case "files":
      if (method === "GET") return json([]);
      return noContent();

    case "attachments":
      if (method === "POST") return json({ paths: [] });
      return noContent();

    default:
      console.warn(
        `[fake-host] unmodeled route ${method} /agents/${id}/${rest.slice(1).join("/")}`,
      );
      return method === "GET" ? json({ items: [] }) : noContent();
  }
}
