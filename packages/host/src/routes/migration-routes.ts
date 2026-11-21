import { routineActorFor } from "../auth/acting";
import { stagedUploads } from "../uploads/commit";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentRest } from "./agent-rest";
import { handleMigration } from "./migration";
import { defineRouteFamily } from "./registry";

defineRouteFamily({
  group: "migration",
  members: [
    { method: "POST", path: "/agents/:agentId/migration/export" },
    { method: "POST", path: "/agents/:agentId/migration/import" },
    { method: "POST", path: "/agents/:agentId/migration/complete" },
    { method: "GET", path: "/agents/:agentId/migration/status" },
  ],
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
        agentDir: deps.agentDir?.(authz.workspace, authz.agent),
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
