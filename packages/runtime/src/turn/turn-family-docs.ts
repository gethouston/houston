import { docKey } from "@houston/domain";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocPublishResult } from "./turn-activity-doc";
import type { ActivityDocSource } from "./turn-activity-source";
import { type TurnFilesystem, turnRoutineRunsKey } from "./turn-filesystem";
import { publishTurnLearningsDoc } from "./turn-learnings-doc";
import { publishTurnRoutinesDoc } from "./turn-routines-doc";
import { publishTurnRunsDoc } from "./turn-runs-doc";
import { docNotLandedReason } from "./turn-view-publish";
import type { TurnRequest } from "./types";

type Turn = TurnRequest & { turnId: string };

type FamilyEvent =
  | "RoutinesChanged"
  | "RoutineRunsChanged"
  | "LearningsChanged";

export async function publishLandedFamilyDocs(input: {
  deps: TurnServerDeps;
  turn: Turn;
  filesystem: TurnFilesystem;
  source: ActivityDocSource;
  landed: readonly string[];
  deleted: readonly string[];
}): Promise<{ errors: string[]; stale: FamilyEvent[] }> {
  const { deps, turn, filesystem } = input;
  const errors: string[] = [];
  const stale: FamilyEvent[] = [];
  const settle = (
    event: FamilyEvent,
    label: string,
    result: ActivityDocPublishResult | null,
  ) => {
    if (result && "error" in result)
      errors.push(`${label} doc publish failed: ${result.error}`);
    if (!result || docNotLandedReason(result)) stale.push(event);
  };
  if (input.landed.includes(turnRoutineRunsKey(filesystem.workspaceRel))) {
    const runs =
      turn.claim && turn.routine
        ? await publishTurnRunsDoc(deps, turn, filesystem)
        : null;
    settle("RoutineRunsChanged", "runs", runs);
  }
  if (input.landed.includes(docKey(filesystem.workspaceRel, "routines"))) {
    const routines = turn.claim
      ? await publishTurnRoutinesDoc(deps, turn, filesystem, input.source)
      : null;
    if (routines) settle("RoutinesChanged", "routines", routines);
  }
  const learningsKey = docKey(filesystem.workspaceRel, "learnings");
  if (
    input.landed.includes(learningsKey) ||
    input.deleted.includes(learningsKey)
  ) {
    const learnings = await publishTurnLearningsDoc(
      deps,
      turn,
      filesystem,
      input.source,
    );
    if (learnings && "disabled" in learnings)
      console.warn(
        `[turn] learnings doc refused by the store (${learnings.reason}); asleep memories lag until the next projection`,
      );
    if (learnings) settle("LearningsChanged", "learnings", learnings);
  }
  return { errors, stale };
}
