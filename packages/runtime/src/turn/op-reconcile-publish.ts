import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeRoutineRuns, parseJsonDoc } from "@houston/domain";
import type { ChatMessage, HoustonEvent } from "@houston/protocol";
import { mergeRoutineRunArrays } from "@houston/runtime-client/object-sync";
import { docTarget, type OpClaimTurn, republish } from "./op-republish";
import type { TurnServerDeps } from "./server-types";
import type { ActivityDocSource } from "./turn-activity-source";
import { publishMerged } from "./turn-doc-merge-publish";
import { type TurnFilesystem, turnRoutineRunsKey } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import { putTranscriptRow } from "./turn-transcript-http";
import { docNotLandedReason } from "./turn-view-publish";

export async function publishReconcile(input: {
  deps: TurnServerDeps;
  turn: OpClaimTurn;
  filesystem: TurnFilesystem;
  source: ActivityDocSource;
  events: readonly HoustonEvent[];
  line?: ChatMessage;
  landed: readonly string[];
}): Promise<{ settle: string[]; lag: string[] }> {
  const { deps, turn, filesystem } = input;
  const settle: string[] = [];
  const lag: string[] = [];
  if (input.line) settle.push(...(await mirrorReply(input, input.line)));
  const target = docTarget(deps, turn);
  if (!target) return { settle, lag };
  settle.push(...(await publishRunsDoc(target, filesystem)));
  const others = input.events.filter(
    (e) => e.type === "ActivityChanged" || e.type === "RoutinesChanged",
  );
  if (others.length > 0) {
    lag.push(
      ...(await republish(
        deps,
        turn,
        filesystem,
        {
          status: 200,
          contentType: "application/json",
          body: "",
          events: others,
          include: () => false,
        },
        input.landed,
        input.source,
      )),
    );
  }
  return { settle, lag };
}

async function publishRunsDoc(
  target: NonNullable<ReturnType<typeof docTarget>>,
  filesystem: TurnFilesystem,
): Promise<string[]> {
  const path = join(
    filesystem.workspaceDir,
    ".houston",
    "routine_runs",
    "routine_runs.json",
  );
  if (!existsSync(path)) return [];
  const key = turnRoutineRunsKey(filesystem.workspaceRel);
  const rows = normalizeRoutineRuns(
    parseJsonDoc(await readFile(path, "utf8"), key),
    key,
  ).items;
  const outcome = await publishMerged(
    { ...target, family: "routine_runs" },
    (current) =>
      mergeRoutineRunArrays(normalizeRoutineRuns(current, key).items, rows),
  );
  const failed = docNotLandedReason(outcome);
  return failed ? [`routine_runs: ${failed}`] : [];
}

async function mirrorReply(
  input: {
    deps: TurnServerDeps;
    turn: OpClaimTurn;
    filesystem: TurnFilesystem;
  },
  message: ChatMessage,
): Promise<string[]> {
  const { deps, turn } = input;
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!baseUrl || !message.turnId) return [];
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  try {
    const response = await putTranscriptRow(
      deps.fetchImpl ?? fetch,
      {
        baseUrl,
        org,
        agent,
        conversationId: turn.conversationId,
        turnId: message.turnId,
        dataDir: input.filesystem.dataDir,
        hostToken: turn.hostToken,
        claim: turn.claim,
        ...(deps.transcriptRetryDelaysMs
          ? { retryDelaysMs: deps.transcriptRetryDelaysMs }
          : {}),
      },
      { kind: "assistant", turnId: message.turnId, message },
    );
    return response.ok
      ? []
      : [`transcript reply rejected (${response.status})`];
  } catch (error) {
    return [
      `transcript reply failed: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}
