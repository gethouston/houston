import { routineActorFor } from "../auth/acting";
import { stagedUploads } from "../uploads/commit";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { handleMigration } from "./migration";
import { defineRouteFamily } from "./registry";

/**
 * The family owns the whole `migration/` prefix, not only the four pairs it
 * serves: an unknown path or a wrong verb inside it is this handler's own 404,
 * so a migration call that names nothing can never be forwarded to the agent's
 * runtime and answered by something else entirely.
 */
defineRouteFamily({
  group: "migration",
  members: [
    { method: "POST", path: "/agents/:agentId/migration/export" },
    { method: "POST", path: "/agents/:agentId/migration/import" },
    { method: "POST", path: "/agents/:agentId/migration/complete" },
    { method: "GET", path: "/agents/:agentId/migration/status" },
  ],
  // `/agents/:agentId/migration` alone is NOT in the prefix (the check above
  // requires the separator), so it falls through to the agent's runtime.
  owns: ["/agents/:agentId/migration/", "/agents/:agentId/migration/*rest"],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/migration.ts",
  handler: async ({ deps, authz, userId, method, path, req, res, emit }) => {
    await handleMigration(
      {
        vfs: deps.vfs,
        uploads: deps.vfs
          ? stagedUploads(deps.uploadSessions, deps.vfs, {
              agentId: authz.agent.id,
              workspace: authz.workspace.id,
              owner: userId,
              purpose: "migration_import",
            })
          : undefined,
        paths: deps.paths ?? DEFAULT_PATHS,
        // Anchors re-synthesized pi sessions on a deployment with a real
        // on-disk tree; absent in cloud, where nothing replays them.
        agentDir: deps.agentDir?.(authz.workspace, authz.agent),
        // The importer, by the same actor policy as the routine write routes.
        routineCreatedBy: routineActorFor(deps, req, userId),
      },
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    );
  },
});
