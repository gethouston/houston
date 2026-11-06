import { randomUUID } from "node:crypto";
import {
  docKey,
  loadActivities,
  missionConversationKey,
} from "@houston/domain";
import { appendLearningChecked } from "@houston/host/src/routes/learning-write";
import type { LiveTurnPin } from "@houston/host/src/routes/live-turn-pin";
import {
  DELEGATED_ROUTINE_REFUSAL,
  isRoutinePause,
} from "@houston/host/src/routes/mission-delegation-refusals";
import { routineAuthoringPin } from "@houston/host/src/routes/routine-creation-pin";
import {
  createRoutineChecked,
  updateRoutineChecked,
} from "@houston/host/src/routes/routine-write";
import type { TurnLimits } from "@houston/protocol";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";

/** Turn-local storage and identity seams for agent-owned writes. */
export interface TurnWriteRoutesDeps {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  workspaceId: string;
  conversationId: string;
  actingAs?: { userId: string; name?: string };
  /** The acting person's plan limits; a routine save is held to its floor. */
  limits?: TurnLimits;
  /** IANA zone in which the deployment fires routines. */
  timezone?: string;
  authoringPin?: LiveTurnPin;
}

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

async function saveRoutine(
  deps: TurnWriteRoutesDeps,
  body: Record<string, unknown>,
): Promise<Response> {
  const { items: missions } = await loadActivities(
    deps.filesystem.vfs,
    deps.filesystem.workspaceRel,
  );
  if (
    !isRoutinePause(body) &&
    missions.some(
      (item) =>
        missionConversationKey(item) === deps.conversationId &&
        Boolean(item.origin_session_key),
    )
  ) {
    return json(409, {
      code: "mission_depth",
      error: DELEGATED_ROUTINE_REFUSAL,
    });
  }
  const { id, ...fields } = body;
  const creating = typeof id !== "string" || id === "";
  const authoringPin = creating
    ? await routineAuthoringPin({
        vfs: deps.filesystem.vfs,
        root: deps.filesystem.workspaceRel,
        fields,
        turnPin: deps.authoringPin,
      })
    : undefined;
  const stableId = creating ? randomUUID() : id;
  const nowIso = new Date().toISOString();
  const minIntervalMinutes = deps.limits?.routineMinIntervalMinutes;
  const floor = minIntervalMinutes ? { minIntervalMinutes } : {};
  // The agent-scoped store cannot read workspace preferences. Dispatch's
  // planner zone makes pooled validation agree with the routine's next fire.
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
              timezone: deps.timezone,
              nowIso,
              id: stableId,
              createdBy: deps.actingAs?.userId,
              authoringPin,
              ...floor,
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
              timezone: deps.timezone,
              nowIso,
              actorSub: deps.actingAs?.userId,
              ...floor,
            },
          ),
  });
  if ("notFound" in result)
    return json(404, { error: `no routine with id '${id}'` });
  // A plan-floor refusal carries its code and minutes beside the reason.
  if ("error" in result) return json(400, result);
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

/** Handle a routine or learning route, or return null when unmatched. */
export async function handleTurnWriteRoute(
  path: string,
  body: Record<string, unknown>,
  deps: TurnWriteRoutesDeps,
): Promise<Response | null> {
  if (path === "/sandbox/routines/save") return saveRoutine(deps, body);
  if (path === "/sandbox/learnings/save") return saveLearning(deps, body);
  return null;
}
