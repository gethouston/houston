import { DEFAULT_PATHS } from "../routes/agent-authz";
import { agentRest } from "../routes/agent-rest";
import { defineRouteFamily } from "../routes/registry";
import { stagedUploads } from "../uploads/commit";
import { handleFiles } from "./files";

const FILES = "/agents/:agentId/files";

defineRouteFamily({
  group: "workspace-files",
  members: [
    { method: "GET", path: FILES },
    { method: "DELETE", path: FILES },
    { method: "GET", path: `${FILES}/download` },
    { method: "GET", path: `${FILES}/archive` },
    { method: "GET", path: `${FILES}/read` },
    { method: "POST", path: `${FILES}/import` },
    { method: "POST", path: `${FILES}/move` },
    { method: "POST", path: `${FILES}/rename` },
    { method: "POST", path: `${FILES}/folder` },
  ],
  owns: [FILES, `${FILES}/`, `${FILES}/*rest`],
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/turn/files.ts",
  handler: ({ deps, authz, userId, method, path, url, req, res, emit }) =>
    handleFiles(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      url.searchParams,
      emit,
      deps.officePreview,
      deps.vfs
        ? stagedUploads(deps.uploadSessions, deps.vfs, {
            agentId: authz.agent.id,
            workspace: authz.workspace.id,
            owner: userId,
            purpose: "files_import",
          })
        : undefined,
    ),
});
