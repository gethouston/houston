import type { ServerResponse } from "node:http";
import type { UserId, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json } from "./http";

export interface AccountDeps {
  store: WorkspaceStore;
  /** Backs the per-workspace preferences doc; absent → preference routes 503. */
  vfs?: Vfs;
  /** Global reactivity fan-out; a sidebar-layout write emits on it. Absent → skipped. */
  events?: EventHub;
}

/**
 * The named workspace when the caller owns it and this deployment can persist
 * preferences for it, else null once the refusal is on the wire. Ownership is
 * checked BEFORE the vfs so a stranger learns nothing about how the host is
 * wired, and a missing workspace reads as 404 rather than 403.
 */
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
