import type { IncomingMessage, ServerResponse } from "node:http";
import { getPreference, loadPreferences, setPreference } from "@houston/domain";
import type { Workspace as WireWorkspace } from "@houston/protocol";
import type { UserId, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { syncGroupContextFiles } from "./group-context-sync";
import { json, readJson } from "./http";
import { parseSidebarLayout, readSidebarLayout } from "./sidebar-layout";

export interface AccountDeps {
  store: WorkspaceStore;
  /** Backs the per-workspace preferences doc; absent → preference routes 503. */
  vfs?: Vfs;
  /** Where agent files live in the vfs; needed to mirror group context to GROUP.md. */
  paths?: WorkspacePaths;
  /** Global reactivity fan-out; a sidebar-layout write emits on it. Absent → skipped. */
  events?: EventHub;
}

/** Map the tenancy-store workspace to the wire shape (UI never sees slug/runtime). */
async function toWire(
  deps: AccountDeps,
  ws: Workspace,
): Promise<WireWorkspace> {
  const locale = deps.vfs
    ? await getPreference(deps.vfs, ws.id, "locale")
    : null;
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
    const wsId = wsPatch[1];
    if (wsId === undefined) return false;
    const ws = await deps.store.getWorkspace(wsId);
    if (!ws || ws.ownerUserId !== userId) {
      reject(res, ws ? 403 : 404);
      return true;
    }
    if (!deps.vfs) {
      json(res, 503, { error: "preferences not configured" });
      return true;
    }
    const body = await readJson(req);
    if ("locale" in body) {
      await setPreference(
        deps.vfs,
        wsId,
        "locale",
        body.locale === null ? null : String(body.locale),
      );
    }
    json(res, 200, await toWire(deps, ws));
    return true;
  }

  // The sidebar's per-workspace order + grouping, persisted as one preference
  // (`sidebar_layout`) so it survives agent churn. Owner-only, same as PATCH.
  const sidebar = path.match(/^\/v1\/workspaces\/([^/]+)\/sidebar-layout$/);
  if (sidebar && (method === "GET" || method === "PUT")) {
    const wsId = sidebar[1];
    if (wsId === undefined) return false;
    const ws = await deps.store.getWorkspace(wsId);
    if (!ws || ws.ownerUserId !== userId) {
      reject(res, ws ? 403 : 404);
      return true;
    }
    if (!deps.vfs) {
      json(res, 503, { error: "preferences not configured" });
      return true;
    }
    if (method === "GET") {
      json(
        res,
        200,
        readSidebarLayout(
          await getPreference(deps.vfs, wsId, "sidebar_layout"),
        ),
      );
      return true;
    }
    // PUT: validate strictly before persisting — a bad body is a clean 400, never
    // a swallowed accept that writes garbage the read path then rejects.
    const layout = parseSidebarLayout(await readJson(req));
    if (!layout) {
      json(res, 400, { error: "invalid sidebar layout" });
      return true;
    }
    const prevLayout = readSidebarLayout(
      await getPreference(deps.vfs, wsId, "sidebar_layout"),
    );
    await setPreference(
      deps.vfs,
      wsId,
      "sidebar_layout",
      JSON.stringify(layout),
    );
    deps.events?.emit(ws.ownerUserId, {
      type: "SidebarLayoutChanged",
      workspaceId: wsId,
    });
    await syncGroupContextFiles(deps, ws, prevLayout, layout);
    json(res, 200, layout);
    return true;
  }

  // Preferences key-value (boot-path reads: locale, legal_acceptance, timezone).
  const pref = path.match(/^\/v1\/preferences\/([^/]+)$/);
  if (pref) {
    const rawKey = pref[1];
    if (rawKey === undefined) return false;
    const key = decodeURIComponent(rawKey);
    if (!deps.vfs) {
      json(res, 503, { error: "preferences not configured" });
      return true;
    }
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    if (method === "GET") {
      json(res, 200, {
        value: (await loadPreferences(deps.vfs, ws.id))[key] ?? null,
      });
      return true;
    }
    if (method === "PUT") {
      const body = await readJson(req);
      const value =
        body.value === null || body.value === undefined
          ? null
          : String(body.value);
      await setPreference(deps.vfs, ws.id, key, value);
      json(res, 200, { value });
      return true;
    }
  }

  return false;
}

const reject = (res: ServerResponse, status: number) =>
  json(res, status, {
    error: status === 404 ? "workspace not found" : "forbidden",
  });
