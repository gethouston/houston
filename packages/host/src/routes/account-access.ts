import type { ServerResponse } from "node:http";
import type { UserId, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json } from "./http";

export interface AccountDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  events?: EventHub;
}

export async function ownedWorkspace(
  deps: AccountDeps,
  userId: UserId,
  workspaceId: string,
  res: ServerResponse,
): Promise<{ ws: Workspace; vfs: Vfs } | null> {
  const ws = await deps.store.getWorkspace(workspaceId);
  if (!ws || ws.ownerUserId !== userId) {
    json(res, ws ? 403 : 404, {
      error: ws ? "forbidden" : "workspace not found",
    });
    return null;
  }
  if (!deps.vfs) {
    json(res, 503, { error: "preferences not configured" });
    return null;
  }
  return { ws, vfs: deps.vfs };
}
