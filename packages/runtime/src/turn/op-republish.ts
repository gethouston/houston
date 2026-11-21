import { docKey, type HoustonFamily } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { OpResult } from "./op-apply";
import { familyDoc } from "./op-family-doc";
import { publishOpStoreDocs } from "./op-store-docs";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocSource } from "./turn-activity-source";
import { publishCustomDefinitionsView } from "./turn-custom-definitions-doc";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import { publishStoreDoc } from "./turn-store-doc";
import { docNotLandedReason } from "./turn-view-publish";

export interface OpClaimTurn {
  gcsPrefix: string;
  hostToken: string;
  claim: { token: string; bootId: string };
  conversationId: string;
}

export const AGENT_DOC_FAMILIES: readonly HoustonFamily[] = [
  "activity",
  "routines",
  "routine_runs",
  "learnings",
  "config",
];

const EVENT_FAMILY: Partial<Record<HoustonEvent["type"], HoustonFamily>> = {
  ActivityChanged: "activity",
  RoutinesChanged: "routines",
  RoutineRunsChanged: "routine_runs",
  ConfigChanged: "config",
  LearningsChanged: "learnings",
};

export type DocDeps = Pick<
  TurnServerDeps,
  "poolStoreUrl" | "fetchImpl" | "activityDocRetryDelaysMs"
>;

export function docTarget(deps: DocDeps, turn: OpClaimTurn) {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!baseUrl) return null;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return {
    baseUrl,
    org,
    agent,
    conversationId: turn.conversationId,
    hostToken: turn.hostToken,
    claim: turn.claim,
    fetchImpl: deps.fetchImpl ?? fetch,
    ...(deps.activityDocRetryDelaysMs
      ? { retryDelaysMs: deps.activityDocRetryDelaysMs }
      : {}),
  };
}

export async function publishFamilyDocs(
  deps: DocDeps,
  turn: OpClaimTurn,
  source: ActivityDocSource,
  workspaceRel: string,
  families: Iterable<HoustonFamily>,
): Promise<string[]> {
  const diagnostics: string[] = [];
  const common = docTarget(deps, turn);
  if (!common) return diagnostics;
  for (const family of families) {
    const key = docKey(workspaceRel, family);
    const outcome = await publishStoreDoc(
      { ...common, family },
      source,
      key,
      (raw) => projectFamily(family, raw, key),
    );
    const failure = docNotLandedReason(outcome);
    if (failure) diagnostics.push(`${family}: ${failure}`);
  }
  return diagnostics;
}

export async function republish(
  deps: DocDeps,
  turn: OpClaimTurn,
  filesystem: TurnFilesystem,
  result: OpResult,
  landed: readonly string[],
  source: ActivityDocSource,
): Promise<string[]> {
  const common = docTarget(deps, turn);
  if (!common) return [];
  const families = new Set<HoustonFamily>();
  for (const event of result.events) {
    const family = EVENT_FAMILY[event.type];
    if (family) families.add(family);
  }
  const learnings = families.delete("learnings");
  const diagnostics = await publishFamilyDocs(
    deps,
    turn,
    source,
    filesystem.workspaceRel,
    families,
  );
  diagnostics.push(
    ...(await publishOpStoreDocs({
      common,
      source,
      filesystem,
      result,
      landed,
      learnings,
    })),
  );
  if (result.customDefinitions !== undefined) {
    const outcome = await publishCustomDefinitionsView(
      { ...common, family: "custom_definitions" },
      source,
      result.customDefinitions,
    );
    const failure = docNotLandedReason(outcome);
    if (failure) diagnostics.push(`custom_definitions: ${failure}`);
  }
  return diagnostics;
}

function projectFamily(
  family: HoustonFamily,
  raw: string | null,
  key: string,
): unknown {
  const doc = familyDoc(family, raw, key);
  if (doc === undefined) throw new Error("file is not JSON, not projected");
  return doc;
}
