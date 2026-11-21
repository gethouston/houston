import type { IncomingMessage, ServerResponse } from "node:http";
import { loadRoutines, removeById, saveRoutines } from "@houston/domain";
import {
  ROUTINE_NOT_FOUND,
  ROUTINE_NOT_FOUND_REASON,
} from "@houston/protocol/routine-refusal";
import type { Vfs } from "../vfs";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import {
  createRoutineChecked,
  type RoutineWriteOptions,
  updateRoutineChecked,
} from "./routine-write";

const ROUTINE_GONE = {
  error: ROUTINE_NOT_FOUND_REASON,
  code: ROUTINE_NOT_FOUND,
};

export async function handleRoutinesData(
  vfs: Vfs,
  root: string,
  workspaceId: string,
  method: string,
  itemId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  fireChange: () => void,
  opts: RoutineWriteOptions & { createdBy?: string },
): Promise<boolean> {
  if (method === "GET" && !itemId) {
    json(res, 200, await loadRoutines(vfs, root));
    return true;
  }
  if (method === "POST" && !itemId) {
    const body = await readJson(req);
    const result = await createRoutineChecked(
      vfs,
      root,
      workspaceId,
      body,
      opts,
    );
    if ("error" in result) {
      json(res, 400, result);
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
      json(res, 404, ROUTINE_GONE);
      return true;
    }
    if ("error" in result) {
      json(res, 400, result);
      return true;
    }
    fireChange();
    json(res, 200, result.routine);
    return true;
  }
  if (method === "DELETE" && itemId) {
    const found = await withDocLock(`${root}#routines`, async () => {
      const { items } = await loadRoutines(vfs, root);
      if (!items.some((r) => r.id === itemId)) return false;
      await saveRoutines(vfs, root, removeById(items, itemId).items);
      return true;
    });
    if (!found) {
      json(res, 404, ROUTINE_GONE);
      return true;
    }
    fireChange();
    json(res, 200, { ok: true });
    return true;
  }
  return false;
}
