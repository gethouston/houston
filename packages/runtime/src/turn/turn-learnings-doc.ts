import { docKey, normalizeLearnings, parseJsonDoc } from "@houston/domain";
import type { TurnServerDeps } from "./server-types";
import type {
  ActivityDocOptions,
  ActivityDocPublishResult,
} from "./turn-activity-doc";
import type { ActivityDocSource } from "./turn-activity-source";
import { turnDocTarget } from "./turn-doc-target";
import type { TurnFilesystem } from "./turn-filesystem";
import { publishStoreDoc } from "./turn-store-doc";
import type { TurnRequest } from "./types";

export async function publishLearningsDoc(
  target: ActivityDocOptions,
  source: ActivityDocSource,
  workspaceRel: string,
): Promise<ActivityDocPublishResult> {
  const rel = docKey(workspaceRel, "learnings");
  return publishStoreDoc(target, source, rel, (raw) =>
    raw === null ? [] : normalizeLearnings(parseJsonDoc(raw, rel), rel).items,
  );
}

export async function publishTurnLearningsDoc(
  deps: TurnServerDeps,
  turn: TurnRequest,
  filesystem: TurnFilesystem,
  source: ActivityDocSource,
): Promise<ActivityDocPublishResult | null> {
  const target = turnDocTarget(deps, turn, "learnings");
  return target
    ? publishLearningsDoc(target, source, filesystem.workspaceRel)
    : null;
}
