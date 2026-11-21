import type { ProviderId } from "@houston/runtime-client";
import { nameTaken, reservedNameRefusal } from "./agent-name-refusals";
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

export function handleAgents(
  method: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response | Promise<Response> {
  if (rest.length === 0) {
    if (method === "GET")
      return json(state.listAgents(state.requestOrgSlug(req)));
    if (method === "POST") {
      const name = String(body?.name ?? "Agent").trim();
      const reserved = reservedNameRefusal(name, {
        migration: body?.migration,
      });
      if (reserved) return reserved;
      const created = state.createAgent(
        name,
        typeof body?.claudeMd === "string" ? body.claudeMd : undefined,
        stringRecord(body?.seeds),
      );
      return created === "name_taken" ? nameTaken(name) : json(created);
    }
    return noContent(405);
  }

  const id = rest[0];

  if (rest.length === 1) {
    if (method === "PATCH") {
      const name = String(body?.name ?? "").trim();
      const reserved = reservedNameRefusal(name, { renamingId: id });
      if (reserved) return reserved;
      const renamed = state.renameAgent(id, name);
      if (renamed === "not_found")
        return json({ error: { message: "agent not found" } }, 404);
      return renamed === "name_taken" ? nameTaken(name) : json(renamed);
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
      return handleActivities(
        method,
        id,
        rest,
        body,
        new URL(req.url).searchParams,
      );

    case "skills":
      return handleSkills(method, id, rest, body);

    case "routines":
      return handleRoutines(method, id, rest, body);

    case "routine_runs":
      if (method === "GET") return json({ items: [] });
      return noContent();

    case "credential":
      return handleCredential(method, id, rest, body);

    case "providers":
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
      if (method !== "POST" || rest.length !== 2) return noContent(405);
      return startFirstDay(id, body ?? {});

    case "files":
      return handleWorkspaceFiles(method, id, rest, req, body);

    case "attachments":
      return handleAttachments(method, id, body);

    case "portable":
      return handlePortableRoutes(method, id, rest[2], body);

    case "migration":
      return handleMigrationRoutes(method, id, rest[2], req, body);

    default:
      console.warn(
        `[fake-host] unmodeled route ${method} /agents/${id}/${rest.slice(1).join("/")}`,
      );
      return method === "GET" ? json({ items: [] }) : noContent();
  }
}
