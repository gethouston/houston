/**
 * Control-plane host data under `/agents/:id/*` for the fake host: the skills
 * manifest, activities, skills, routines, agent files and composer
 * attachments (packages/engine-adapter/src/control-plane.ts).
 */

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
): Response {
  if (rest.length === 2) {
    if (method === "GET") return json({ items: state.listActivities(id) });
    if (method === "POST") return json(state.createActivity(id, body ?? {}));
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

export function handleSkills(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
  // Skills are agent-scoped; creates land in the per-agent skills state
  // (state-skills.ts) so the list, the editor and delete work end to end.
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
  return noContent(); // run etc. — accepted no-ops
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
    return updated ? json(updated) : json({ error: {} }, 404);
  }
  if (rest.length === 3 && method === "DELETE") {
    state.deleteRoutine(id, rid);
    return noContent();
  }
  return noContent(); // run-now / scheduler-sync — accepted no-ops
}

export function handleAgentFile(
  method: string,
  id: string,
  rest: string[],
  body: Record<string, unknown> | undefined,
): Response {
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

export function handleAttachments(
  method: string,
  id: string,
  body: Record<string, unknown> | undefined,
): Response {
  // Composer attachments — faithful to the real host's `turn/attachments.ts`:
  // a 100MB request cap (413), `scopeId` accepted+ignored, and files stored
  // in the agent's visible, durable `uploads/` folder (HOU-706) with
  // colliding names disambiguated. Returns the RELATIVE `uploads/<name>`
  // paths the agent's Read tool opens.
  if (method !== "POST") return noContent(405);
  const files = (Array.isArray(body?.files) ? body.files : []) as {
    name: string;
    contentBase64: string;
  }[];
  // base64 is ~4/3 the byte size; estimate to reject oversized uploads.
  let total = 0;
  for (const f of files) total += Math.floor((f.contentBase64.length * 3) / 4);
  if (total > 100 * 1024 * 1024)
    return json({ error: "attachments exceed the upload size limit" }, 413);
  return json({ paths: state.importWorkspaceFiles(id, "uploads", files) });
}
