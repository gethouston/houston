/**
 * Per-agent route dispatch for the fake host: everything under `/agents/:id/*`.
 *
 * Two contracts share this namespace (mirroring the real deployment):
 *  - control-plane host data — activities, routines, skills, agent files
 *    (packages/engine-adapter/src/control-plane.ts; routes-agent-data.ts), and
 *  - the per-agent runtime proxy — providers, auth, settings, and the
 *    conversation stream (packages/runtime-client/src/client.ts), reached at
 *    `/agents/:id/conversations/:cid/*` (routes-agent-runtime.ts).
 *
 * The chat turn is the interesting one: the client subscribes to the
 * conversation's SSE stream FIRST, then POSTs the message (fire-and-forget 202).
 * We register the open stream, then push a canned reply (`text` deltas → `usage`
 * → `done`) when the message lands. See translate.ts `streamTurn`.
 */

import type { ProviderId } from "@houston/runtime-client";
import { json, noContent } from "./http";
import {
  handleActivities,
  handleAgentFile,
  handleAttachments,
  handleRoutines,
  handleSkills,
  handleSkillsManifest,
} from "./routes-agent-data";
import {
  handleAuth,
  handleConversations,
  handleCredential,
} from "./routes-agent-runtime";
import { handleWorkspaceFiles } from "./routes-files";
import { startFirstDay } from "./routes-first-day";
import { handleMigrationRoutes } from "./routes-migration";
import { handlePortableRoutes } from "./routes-portable";
import * as state from "./state";

/** A create's `seeds` map, when it is one. */
function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value);
  return entries.every(([, v]) => typeof v === "string")
    ? (Object.fromEntries(entries) as Record<string, string>)
    : undefined;
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
): Response | Promise<Response> {
  // /agents
  if (rest.length === 0) {
    if (method === "GET") return json(state.listAgents());
    if (method === "POST")
      return json(
        state.createAgent(
          String(body?.name ?? "Agent"),
          typeof body?.claudeMd === "string" ? body.claudeMd : undefined,
          stringRecord(body?.seeds),
        ),
      );
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
    case "skills-manifest":
      return handleSkillsManifest(method, id, rest, body);

    case "activities":
      return handleActivities(method, id, rest, body);

    case "skills":
      return handleSkills(method, id, rest, body);

    case "routines":
      return handleRoutines(method, id, rest, body);

    case "routine_runs":
      if (method === "GET") return json({ items: [] });
      return noContent(); // create/update/delete/run — accepted no-ops

    case "credential":
      return handleCredential(method, id, rest, body);

    case "providers":
      // `/providers/usage` is the live per-account usage the AI Models hub's
      // Connected rows meter with; anything else under the segment is the list.
      if (rest[2] === "usage") return json(state.providerUsageList());
      return json(state.providerList(id));

    case "settings":
      return json(
        state.setSettings(id, {
          activeProvider: body?.activeProvider as ProviderId | undefined,
          model: typeof body?.model === "string" ? body.model : undefined,
          effort: typeof body?.effort === "string" ? body.effort : undefined,
        }),
      );

    case "title":
      return json({ title: makeTitle(String(body?.text ?? "")) });

    case "auth":
      return handleAuth(id, rest, req);

    case "conversations":
      return handleConversations(method, id, rest, req, body);

    case "agentfile":
      return handleAgentFile(method, id, rest, body);

    case "first-day":
      // An AI Employee's first day: the host-side start (routes-first-day.ts).
      if (method !== "POST" || rest.length !== 2) return noContent(405);
      return startFirstDay(id, body ?? {});

    case "files":
      // The Files tab's workspace surface (list/upload/move/…): routes-files.ts.
      return handleWorkspaceFiles(method, id, rest, req, body);

    case "attachments":
      return handleAttachments(method, id, body);

    case "portable":
      // Share / copy: the export inventory and the packaged `.houstonagent`,
      // both from this agent's own state (routes-portable.ts).
      return handlePortableRoutes(method, id, rest[2], body);

    case "migration":
      // The chats leg of "Copy an agent": zip the board + transcripts out of
      // one agent, unpack them into another (routes-migration.ts).
      return handleMigrationRoutes(method, id, rest[2], req, body);

    default:
      console.warn(
        `[fake-host] unmodeled route ${method} /agents/${id}/${rest.slice(1).join("/")}`,
      );
      return method === "GET" ? json({ items: [] }) : noContent();
  }
}
