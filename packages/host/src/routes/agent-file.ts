import type { IncomingMessage, ServerResponse } from "node:http";
import { agentFileEventType, docKey } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";
import { hostOwnedApprovalCards } from "./activity-approval-cards";
import { DEFAULT_PATHS } from "./agent-authz";
import { writeSurfaceConfigText } from "./agent-config-write";
import {
  isReadOnlyDocument,
  isServedDocument,
  READ_ONLY_DOCUMENT_REFUSAL,
} from "./agent-file-scope";
import { agentRest } from "./agent-rest";
import { json, methodNotAllowed, readJson } from "./http";
import { defineRoute } from "./registry";

const ACTIVITY_DOCUMENT = ".houston/activity/activity.json";

function eventForPath(rel: string, agentPath: string): HoustonEvent | null {
  const type = agentFileEventType(rel);
  if (type === null) return null;
  return { type, agentPath };
}

function servedContent(rel: string, content: string, agentId: string): string {
  if (rel !== ACTIVITY_DOCUMENT || content === "") return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  return JSON.stringify(hostOwnedApprovalCards(parsed, agentId));
}

defineRoute({
  group: "agent-file",
  method: ["GET", "PUT", "POST"],
  path: "/agents/:agentId/agentfile/*rest",
  methodMismatch: "405",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/agent-file.ts",
  handler: ({ deps, authz, method, path, req, res, emit }) =>
    handleAgentFile(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    ),
});

export async function handleAgentFile(
  vfs: Vfs | undefined,
  paths: WorkspacePaths,
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  const m = rest.match(/^agentfile\/(.+)$/);
  if (!m) return false;
  const captured = m[1];
  if (captured === undefined) return false;
  const rel = decodeURIComponent(captured);

  if (!vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  if (
    rel.startsWith("/") ||
    rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    json(res, 400, { error: "invalid path" });
    return true;
  }
  if (!isServedDocument(rel)) {
    json(res, 403, {
      error: "that is not one of the agent's documents",
      code: "path_not_allowed",
    });
    return true;
  }
  const key = `${paths.agentRoot(ctx.workspace, ctx.agent)}/${rel}`;

  if (method === "GET") {
    const content = (await vfs.readText(key)) ?? "";
    json(res, 200, { content: servedContent(rel, content, ctx.agent.id) });
    return true;
  }
  if (method === "PUT" || method === "POST") {
    if (isReadOnlyDocument(rel)) {
      json(res, 403, READ_ONLY_DOCUMENT_REFUSAL);
      return true;
    }
    const body = await readJson(req);
    if (typeof body.content !== "string") {
      json(res, 400, { error: "missing 'content'" });
      return true;
    }
    const root = paths.agentRoot(ctx.workspace, ctx.agent);
    if (rel === docKey("", "config").slice(1))
      await writeSurfaceConfigText(vfs, root, key, body.content);
    else await vfs.writeText(key, body.content);
    const event = eventForPath(rel, ctx.agent.id);
    if (event) emit?.(event);
    json(res, 200, { ok: true });
    return true;
  }

  methodNotAllowed(res);
  return true;
}
