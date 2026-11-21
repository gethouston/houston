import { activityStampSchema, activityUpdateSchema } from "@houston/protocol";
import {
  ROUTINE_NOT_FOUND,
  ROUTINE_NOT_FOUND_REASON,
} from "@houston/protocol/routine-refusal";
import { json, noContent } from "./http";
import * as state from "./state";

export function handleSkillsManifest(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
  if (rest.length !== 2) return noContent(404);
  if (method === "GET") return json(state.getSkillsManifest(id));
  if (method === "PUT") return json(state.putSkillsManifest(id, body ?? {}));
  return noContent(405);
}

export function handleActivities(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
  params: URLSearchParams,
): Response {
  if (rest.length === 2) {
    if (method === "GET") return json({ items: state.listActivities(id) });
    if (method === "POST") return json(state.createActivity(id, body ?? {}));
    return noContent(405);
  }
  const aid = rest[2];
  if (method === "PATCH") {
    const update = activityUpdateSchema.safeParse(body ?? {});
    const stamp = activityStampSchema
      .optional()
      .safeParse(params.get("stamp") ?? undefined);
    if (!update.success) return json({ error: "invalid activity update" }, 400);
    const updated = state.updateActivity(
      id,
      aid,
      update.data,
      stamp.success ? stamp.data : undefined,
    );
    return updated ? json(updated) : json({ error: "activity not found" }, 404);
  }
  if (method === "DELETE") {
    state.deleteActivity(id, aid);
    return noContent();
  }
  return noContent(405);
}

export function handleSkills(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
  if (rest.length === 2) {
    if (method === "GET") return json({ items: state.listSkills(id) });
    if (method === "POST") {
      state.createSkill(id, (body ?? {}) as Record<string, string>);
      return noContent(201);
    }
    return noContent(405);
  }
  const slug = decodeURIComponent(rest[2] ?? "");
  if (rest.length === 3) {
    if (method === "GET") {
      const detail = state.loadSkill(id, slug);
      return detail ? json(detail) : json({ error: {} }, 404);
    }
    if (method === "PUT") {
      return state.saveSkill(id, slug, String(body?.content ?? ""))
        ? noContent()
        : json({ error: {} }, 404);
    }
    if (method === "DELETE") {
      return state.deleteSkill(id, slug)
        ? noContent()
        : json({ error: {} }, 404);
    }
  }
  return noContent();
}

export function handleRoutines(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
  if (rest.length === 2) {
    if (method === "GET") return json({ items: state.listRoutines(id) });
    if (method === "POST")
      return json(state.createRoutine(id, body ?? {}), 201);
    return noContent(405);
  }
  const rid = rest[2];
  if (rest.length === 3 && method === "PATCH") {
    const updated = state.updateRoutine(id, rid, body ?? {});
    return updated
      ? json(updated)
      : json({ error: ROUTINE_NOT_FOUND_REASON, code: ROUTINE_NOT_FOUND }, 404);
  }
  if (rest.length === 3 && method === "DELETE") {
    state.deleteRoutine(id, rid);
    return noContent();
  }
  return noContent();
}

export function handleAgentFile(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
  const relPath = rest.slice(2).join("/");
  if (method === "GET")
    return json({ content: state.readAgentFile(id, relPath) });
  if (method === "PUT") {
    state.writeAgentFile(id, relPath, String(body?.content ?? ""));
    return noContent();
  }
  return noContent(405);
}

export function handleAttachments(
  method: string,
  id: string,
  body: Record<string, unknown> | undefined,
): Response {
  if (method !== "POST") return noContent(405);
  const files = (Array.isArray(body?.files) ? body.files : []) as {
    name: string;
    contentBase64: string;
  }[];
  let total = 0;
  for (const f of files) total += Math.floor((f.contentBase64.length * 3) / 4);
  if (total > 100 * 1024 * 1024)
    return json({ error: "attachments exceed the upload size limit" }, 413);
  return json({ paths: state.importWorkspaceFiles(id, "uploads", files) });
}
