import type { TurnServerDeps } from "./server-types";
import type { ActivityDocPublishResult } from "./turn-activity-doc";
import {
  type ActivityDocSource,
  readStoredActivityDoc,
} from "./turn-activity-source";
import { publishDerived } from "./turn-doc-merge-publish";
import { turnDocTarget } from "./turn-doc-target";
import type { TurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

class BoardUnreadable extends Error {}

export async function publishTurnActivityDoc(
  deps: TurnServerDeps,
  turn: TurnRequest,
  filesystem: TurnFilesystem,
  source: ActivityDocSource,
): Promise<ActivityDocPublishResult | null> {
  const target = turnDocTarget(deps, turn, "activity");
  if (!target) return null;
  try {
    return await publishDerived(target, async () => {
      const board = await readStoredActivityDoc(source, filesystem);
      if (board === undefined) throw new BoardUnreadable();
      return board;
    });
  } catch (error) {
    if (error instanceof BoardUnreadable)
      return { skipped: "stale_after_conflict" };
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
