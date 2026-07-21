import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutines, removeById, saveRoutines } from "@houston/domain";
import type { Vfs } from "../vfs";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import {
  createRoutineChecked,
  type RoutineWriteOptions,
  updateRoutineChecked,
} from "./routine-write";

/**
 * The `routines` typed-family CRUD for the authenticated agent-data route, split
 * out of agent-data.ts (mirrors agent-data-activities.ts). GET lists; POST/PATCH
 * go through the merge-safe write path shared with the runtime's save_routine
 * tool (routine-write.ts) so neither surface ever clobbers the file. Returns true
 * when it answered, false when the method is unsupported (caller responds 405).
 */
export async function handleRoutinesData(
  vfs: Vfs,
  root: string,
  workspaceId: string,
  method: string,
  itemId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  fireChange: () => void,
  // `createdBy`: the verified acting identity recorded as a new routine's creator
  // (re-stamped on PATCH), so a fired routine acts as whoever last shaped it.
  opts: RoutineWriteOptions & { createdBy?: string },
): Promise<boolean> {
  if (method === "GET" && !itemId) {
    json(res, 200, await loadRoutines(vfs, root));
    return true;
  }
  if (method === "POST" && !itemId) {
    const body = await readJson(req);
    // Merge-safe create: read-modify-write, never a wholesale replace. The gate
    // (name/prompt, exactly-one-wake, trigger backend, cron, provider) is shared
    // with the runtime's save_routine tool — see routine-write.ts.
    const result = await createRoutineChecked(
      vfs,
      root,
      workspaceId,
      body,
      opts,
    );
    if ("error" in result) {
      json(res, 400, { error: result.error });
      return true;
    }
    fireChange();
    json(res, 201, result.routine);
    return true;
  }
  if (method === "PATCH" && itemId) {
    const update = await readJson(req);
    const result = await updateRoutineChecked(
      vfs,
      root,
      workspaceId,
      itemId,
      update,
      { ...opts, actorSub: opts.createdBy },
    );
    if ("notFound" in result) {
      json(res, 404, { error: "routine not found" });
      return true;
    }
    if ("error" in result) {
      json(res, 400, { error: result.error });
      return true;
    }
    fireChange();
    json(res, 200, result.routine);
    return true;
  }
  if (method === "DELETE" && itemId) {
    // Same per-doc lock as the shared write path (routine-write.ts): a delete
    // racing a create/update must not resurrect or drop the other's entry.
    const found = await withDocLock(`${root}#routines`, async () => {
      const { items } = await loadRoutines(vfs, root);
      if (!items.some((r) => r.id === itemId)) return false;
      await saveRoutines(vfs, root, removeById(items, itemId).items);
      return true;
    });
    if (!found) {
      json(res, 404, { error: "routine not found" });
      return true;
    }
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }
  return false;
}
