import { randomUUID } from "node:crypto";
import { docKey } from "@houston/domain";
import { appendLearningChecked } from "@houston/host/src/routes/learning-write";
import {
  createRoutineChecked,
  updateRoutineChecked,
} from "@houston/host/src/routes/routine-write";
import {
  communityDirectory,
  previewDirectory,
} from "@houston/host/src/routes/skills-directory";
import { searchCommunitySkills } from "@houston/host/src/routes/skills-search";
import { installCommunitySkill } from "@houston/host/src/skills/install";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";

/** Turn-local storage, identity, and network seams for agent-owned writes. */
export interface TurnWriteRoutesDeps {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  workspaceId: string;
  conversationId: string;
  actingAs?: { userId: string; name?: string };
  fetchImpl: typeof fetch;
}

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

async function saveRoutine(
  deps: TurnWriteRoutesDeps,
  body: Record<string, unknown>,
): Promise<Response> {
  const { id, ...fields } = body;
  const creating = typeof id !== "string" || id === "";
  const stableId = creating ? randomUUID() : id;
  const nowIso = new Date().toISOString();
  const result = await mutateTurnDocument({
    ...deps,
    relativePath: docKey(deps.filesystem.workspaceRel, "routines"),
    shouldCommit: (outcome) => "routine" in outcome,
    apply: () =>
      creating
        ? createRoutineChecked(
            deps.filesystem.vfs,
            deps.filesystem.workspaceRel,
            deps.workspaceId,
            fields,
            {
              triggersEnabled: true,
              nowIso,
              id: stableId,
              createdBy: deps.actingAs?.userId,
            },
          )
        : updateRoutineChecked(
            deps.filesystem.vfs,
            deps.filesystem.workspaceRel,
            deps.workspaceId,
            stableId,
            fields,
            {
              triggersEnabled: true,
              nowIso,
              actorSub: deps.actingAs?.userId,
            },
          ),
  });
  if ("notFound" in result)
    return json(404, { error: `no routine with id '${id}'` });
  if ("error" in result) return json(400, { error: result.error });
  return json(creating ? 201 : 200, result.routine);
}

async function saveLearning(
  deps: TurnWriteRoutesDeps,
  body: Record<string, unknown>,
): Promise<Response> {
  const id = randomUUID();
  const nowIso = new Date().toISOString();
  const result = await mutateTurnDocument({
    ...deps,
    relativePath: docKey(deps.filesystem.workspaceRel, "learnings"),
    shouldCommit: (outcome) => "learning" in outcome,
    apply: () =>
      appendLearningChecked(deps.filesystem.vfs, deps.filesystem.workspaceRel, {
        id,
        text: typeof body.text === "string" ? body.text : "",
        nowIso,
        ...(deps.actingAs
          ? {
              taughtBy: {
                user_id: deps.actingAs.userId,
                ...(deps.actingAs.name ? { name: deps.actingAs.name } : {}),
              },
            }
          : {}),
        conversationId: deps.conversationId,
      }),
  });
  return "error" in result
    ? json(400, { error: result.error })
    : json(201, result.learning);
}

/** Handle a routine, learning, or skill route, or return null when unmatched. */
export async function handleTurnWriteRoute(
  path: string,
  body: Record<string, unknown>,
  deps: TurnWriteRoutesDeps,
): Promise<Response | null> {
  if (path === "/sandbox/routines/save") return saveRoutine(deps, body);
  if (path === "/sandbox/learnings/save") return saveLearning(deps, body);
  if (path === "/sandbox/skills/search") {
    const queries = Array.isArray(body.queries)
      ? body.queries
          .filter((query): query is string => typeof query === "string")
          .map((query) => query.trim())
          .filter((query) => query.length > 0)
          .slice(0, 3)
      : [];
    if (queries.length === 0) return json(400, { error: "missing 'queries'" });
    return json(
      200,
      await searchCommunitySkills(
        {
          directory: communityDirectory,
          previews: previewDirectory,
          fetchImpl: deps.fetchImpl,
        },
        queries,
      ),
    );
  }
  if (path === "/sandbox/skills/install") {
    if (typeof body.source !== "string" || typeof body.skillId !== "string") {
      return json(400, { error: "missing 'source' or 'skillId'" });
    }
    const slug = await installCommunitySkill(
      deps.fetchImpl,
      deps.filesystem.vfs,
      deps.filesystem.workspaceRel,
      body.source,
      body.skillId,
    );
    return json(201, { slug, path: `.agents/skills/${slug}/SKILL.md` });
  }
  return null;
}
