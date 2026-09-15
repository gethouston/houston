import { getPreference, loadPreferences, setPreference } from "@houston/domain";
import type { Workspace as WireWorkspace } from "@houston/protocol";
import type { Workspace } from "../domain/types";
import { type AccountDeps, ownedWorkspace } from "./account-access";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/**
 * User-level resources the host owns: workspaces (the tenancy container) and
 * preferences (timezone / locale / legal_acceptance). Personal tier → one
 * workspace per user, so these are scoped to the caller's own workspace and
 * need no agent. The sidebar layout rides the same ownership seam and lives in
 * account-sidebar.ts.
 */
const SOURCE = "packages/host/src/routes/account.ts";

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

// The user's workspaces — cloud personal-tier returns one (auto-provisioned on
// first touch), the local profile returns every workspace on disk.
defineRoute({
  group: "account",
  method: "GET",
  path: "/v1/workspaces",
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  handler: async ({ deps, userId, res }) => {
    await deps.store.getOrCreatePersonalWorkspace(userId); // ensure ≥1 exists (cloud)
    const owned = await deps.store.listWorkspacesForUser(userId);
    json(res, 200, await Promise.all(owned.map((ws) => toWire(deps, ws))));
  },
});

// Update a workspace's UI settings. Only the owner; only locale is mutable in
// cloud (name is fixed, provider/model live on each agent's config).
defineRoute({
  group: "account",
  method: "PATCH",
  path: "/v1/workspaces/:workspaceId",
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  handler: async ({ deps, userId, params, req, res }) => {
    const wsId = params.workspaceId ?? "";
    const owned = await ownedWorkspace(deps, userId, wsId, res);
    if (!owned) return;
    const body = await readJson(req);
    if ("locale" in body) {
      await setPreference(
        owned.vfs,
        wsId,
        "locale",
        body.locale === null ? null : String(body.locale),
      );
    }
    json(res, 200, await toWire(deps, owned.ws));
  },
});

// Preferences key-value (boot-path reads: locale, legal_acceptance, timezone).
// Scoped to the caller's own personal workspace, so no id rides the path.
defineRoute({
  group: "account",
  method: ["GET", "PUT"],
  path: "/v1/preferences/:key",
  phase: "user",
  classification: "sdk",
  source: SOURCE,
  handler: async ({ deps, userId, method, params, req, res }) => {
    const key = params.key ?? "";
    const vfs = deps.vfs;
    if (!vfs) return json(res, 503, { error: "preferences not configured" });
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    if (method === "GET")
      return json(res, 200, {
        value: (await loadPreferences(vfs, ws.id))[key] ?? null,
      });
    const body = await readJson(req);
    const value =
      body.value === null || body.value === undefined
        ? null
        : String(body.value);
    await setPreference(vfs, ws.id, key, value);
    json(res, 200, { value });
  },
});
