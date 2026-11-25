import { docKey } from "@houston/domain";
import { isRoutineNotFoundBody } from "@houston/protocol/routine-refusal";
import { familyDoc } from "./op-family-doc";
import { type DocDeps, docTarget, type OpClaimTurn } from "./op-republish";
import type { OpResult } from "./op-result";
import type { AgentOp } from "./parse-op-request";
import type { ActivityDocSource } from "./turn-activity-source";
import { publishDerived } from "./turn-doc-merge-publish";
import { readStoreText } from "./turn-store-read";
import { docNotLandedReason } from "./turn-view-publish";

// WHY: Must fit the gateway's 5 s run-now window with dispatch and hydration. ADR-0015
export const ROUTINE_HEAL_BUDGET_MS = 1_500;

const ROUTINE_ITEM = /^routines\/([^/]+)$/;

export function staleRoutineWriteId(
  op: AgentOp,
  result: OpResult,
): string | null {
  if (op.kind !== "route" || result.status !== 404) return null;
  if (op.method !== "PATCH" && op.method !== "DELETE") return null;
  let rest: string;
  try {
    rest = decodeURIComponent(op.rest);
  } catch {
    return null;
  }
  const id = ROUTINE_ITEM.exec(rest)?.[1];
  if (!id) return null;
  try {
    return isRoutineNotFoundBody(JSON.parse(result.body)) ? id : null;
  } catch {
    return null;
  }
}

class MirrorAlreadyRight extends Error {}

const listsRoutine = (doc: unknown, id: string) =>
  Array.isArray(doc) &&
  doc.some((r) => (r as { id?: unknown } | null)?.id === id);

export async function healRoutinesMirror(
  deps: DocDeps,
  turn: OpClaimTurn,
  source: ActivityDocSource,
  workspaceRel: string,
  routineId: string,
): Promise<"RoutinesChanged"[]> {
  const common = docTarget(deps, turn);
  if (!common) return [];
  const budget = new AbortController();
  const fetchImpl = common.fetchImpl;
  const key = docKey(workspaceRel, "routines");
  const heal = publishDerived(
    {
      ...common,
      family: "routines",
      retryDelaysMs: [],
      fetchImpl: ((input, init) =>
        fetchImpl(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, budget.signal])
            : budget.signal,
        })) as typeof fetch,
    },
    async (current) => {
      if (!listsRoutine(current, routineId)) throw new MirrorAlreadyRight();
      if (budget.signal.aborted) throw new Error("heal budget spent");
      const doc = familyDoc("routines", await readStoreText(source, key), key);
      if (budget.signal.aborted) throw new Error("heal budget spent");
      if (doc === undefined) throw new Error("file is not JSON, not projected");
      return doc;
    },
  ).then(docNotLandedReason, (error: unknown) =>
    error instanceof MirrorAlreadyRight
      ? "already right"
      : error instanceof Error
        ? error.message
        : String(error),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<string>((resolve) => {
    timer = setTimeout(() => {
      budget.abort();
      resolve(`no answer within ${ROUTINE_HEAL_BUDGET_MS} ms`);
    }, ROUTINE_HEAL_BUDGET_MS);
  });
  const failure = await Promise.race([heal, expired]);
  clearTimeout(timer);
  budget.abort();
  if (failure === "already right") return [];
  const at = `routine=${routineId} prefix=${turn.gcsPrefix}`;
  if (failure) {
    console.error(
      `[routines] stale routines mirror not healed: ${failure} ${at}`,
    );
    return [];
  }
  console.warn(`[routines] re-projected the routines doc over a ghost ${at}`);
  return ["RoutinesChanged"];
}
