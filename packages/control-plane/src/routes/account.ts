import type { IncomingMessage, ServerResponse } from "node:http";
import type { Workspace as WireWorkspace } from "@houston/protocol";
import { getPreference, loadPreferences, setPreference } from "@houston/domain";
import type { UserId, Workspace } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";

export interface AccountDeps {
  store: WorkspaceStore;
  /** Backs the per-workspace preferences doc; absent → preference routes 503. */
  vfs?: Vfs;
}

/** Map the tenancy-store workspace to the wire shape (UI never sees slug/runtime). */
async function toWire(deps: AccountDeps, ws: Workspace): Promise<WireWorkspace> {
  const locale = deps.vfs ? await getPreference(deps.vfs, ws.id, "locale") : null;
  return {
    id: ws.id,
    name: ws.name,
    isDefault: ws.kind === "personal",
    createdAt: new Date(ws.createdAt).toISOString(),
    locale,
  };
}

/**
 * User-level resources the host owns: workspaces (the tenancy container) and
 * preferences (timezone / locale / legal_acceptance). Personal tier → one
 * workspace per user, so these are scoped to the caller's own workspace and
 * need no agent. Returns true when handled.
 */
export async function handleAccount(
  deps: AccountDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // The user's workspaces — cloud personal-tier returns one (auto-provisioned on
  // first touch), the local profile returns every workspace on disk.
  if (path === "/v1/workspaces" && method === "GET") {
    await deps.store.getOrCreatePersonalWorkspace(userId); // ensure ≥1 exists (cloud)
    const owned = await deps.store.listWorkspacesForUser(userId);
    json(res, 200, await Promise.all(owned.map((ws) => toWire(deps, ws))));
    return true;
  }

  // Update a workspace's UI settings. Only the owner; only locale is mutable in
  // cloud (name is fixed, provider/model live on each agent's config).
  const wsPatch = path.match(/^\/v1\/workspaces\/([^/]+)$/);
  if (wsPatch && method === "PATCH") {
    const wsId = wsPatch[1]!;
    const ws = await deps.store.getWorkspace(wsId);
    if (!ws || ws.ownerUserId !== userId) return reject(res, ws ? 403 : 404), true;
    if (!deps.vfs) return json(res, 503, { error: "preferences not configured" }), true;
    const body = await readJson(req);
    if ("locale" in body) {
      await setPreference(deps.vfs, wsId, "locale", body.locale === null ? null : String(body.locale));
    }
    json(res, 200, await toWire(deps, ws));
    return true;
  }

  // Preferences key-value (boot-path reads: locale, legal_acceptance, timezone).
  const pref = path.match(/^\/v1\/preferences\/([^/]+)$/);
  if (pref) {
    const key = decodeURIComponent(pref[1]!);
    if (!deps.vfs) return json(res, 503, { error: "preferences not configured" }), true;
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    if (method === "GET") {
      json(res, 200, { value: (await loadPreferences(deps.vfs, ws.id))[key] ?? null });
      return true;
    }
    if (method === "PUT") {
      const body = await readJson(req);
      const value = body.value === null || body.value === undefined ? null : String(body.value);
      await setPreference(deps.vfs, ws.id, key, value);
      json(res, 200, { value });
      return true;
    }
  }

  return false;
}

const reject = (res: ServerResponse, status: number) =>
  json(res, status, { error: status === 404 ? "workspace not found" : "forbidden" });
