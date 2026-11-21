import { getPreference, updatePreference } from "@houston/domain";
import { ownedWorkspace } from "./account-access";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";
import { parseSidebarLayout, readSidebarLayout } from "./sidebar-layout";

defineRoute({
  group: "account",
  method: ["GET", "PUT"],
  path: "/v1/workspaces/:workspaceId/sidebar-layout",
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/account-sidebar.ts",
  handler: async ({ deps, userId, method, params, req, res }) => {
    const wsId = params.workspaceId ?? "";
    const owned = await ownedWorkspace(deps, userId, wsId, res);
    if (!owned) return;
    const { ws, vfs } = owned;
    if (method === "GET")
      return json(
        res,
        200,
        readSidebarLayout(await getPreference(vfs, wsId, "sidebar_layout")),
      );
    const layout = parseSidebarLayout(await readJson(req));
    if (!layout) return json(res, 400, { error: "invalid sidebar layout" });
    await updatePreference(vfs, wsId, "sidebar_layout", () =>
      JSON.stringify(layout),
    );
    deps.events?.emit(ws.ownerUserId, {
      type: "SidebarLayoutChanged",
      workspaceId: wsId,
    });
    json(res, 200, layout);
  },
});
