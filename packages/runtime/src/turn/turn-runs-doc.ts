import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeRoutineRuns, parseJsonDoc } from "@houston/domain";
import { mergeRoutineRunArrays } from "@houston/runtime-client/object-sync";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocPublishResult } from "./turn-activity-doc";
import { publishMerged } from "./turn-doc-merge-publish";
import { type TurnFilesystem, turnRoutineRunsKey } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

export async function publishTurnRunsDoc(
  deps: TurnServerDeps,
  turn: TurnRequest & { turnId: string },
  filesystem: TurnFilesystem,
): Promise<ActivityDocPublishResult | null> {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (turn.shadow || !baseUrl || !turn.claim || !turn.hostToken) return null;
  try {
    const runsKey = turnRoutineRunsKey(filesystem.workspaceRel);
    const raw = await readFile(
      join(
        filesystem.workspaceDir,
        ".houston",
        "routine_runs",
        "routine_runs.json",
      ),
      "utf8",
    );
    const rows = normalizeRoutineRuns(
      parseJsonDoc(raw, runsKey),
      runsKey,
    ).items;
    const { org, agent } = poolIdentity(turn.gcsPrefix);
    return await publishMerged(
      {
        family: "routine_runs",
        baseUrl,
        org,
        agent,
        conversationId: turn.conversationId,
        hostToken: turn.hostToken,
        claim: { token: turn.claim.token, bootId: turn.claim.bootId },
        fetchImpl: deps.fetchImpl ?? fetch,
        ...(deps.activityDocRetryDelaysMs
          ? { retryDelaysMs: deps.activityDocRetryDelaysMs }
          : {}),
      },
      (current) =>
        mergeRoutineRunArrays(
          normalizeRoutineRuns(current, runsKey).items,
          rows,
        ),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
