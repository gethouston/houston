import { docKey, normalizeRoutines, parseJsonDoc } from "@houston/domain";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocPublishResult } from "./turn-activity-doc";
import type { ActivityDocSource } from "./turn-activity-source";
import { turnDocTarget } from "./turn-doc-target";
import type { TurnFilesystem } from "./turn-filesystem";
import { publishStoreDoc } from "./turn-store-doc";
import type { TurnRequest } from "./types";

export async function publishTurnRoutinesDoc(
  deps: TurnServerDeps,
  turn: TurnRequest,
  filesystem: TurnFilesystem,
  source: ActivityDocSource,
): Promise<ActivityDocPublishResult | null> {
  const target = turnDocTarget(deps, turn, "routines");
  if (!target) return null;
  const rel = docKey(filesystem.workspaceRel, "routines");
  return publishStoreDoc(target, source, rel, (raw) =>
    raw === null ? [] : normalizeRoutines(parseJsonDoc(raw, rel), rel).items,
  );
}
