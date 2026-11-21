import { DEFAULT_PATHS } from "../routes/agent-authz";
import { agentRest } from "../routes/agent-rest";
import { defineRoute } from "../routes/registry";
import { stagedUploads } from "../uploads/commit";
import { handleAttachments } from "./attachments";

defineRoute({
  group: "attachments",
  method: "POST",
  path: "/agents/:agentId/attachments",
  methodMismatch: "405",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/turn/attachments.ts",
  handler: ({ deps, authz, userId, method, path, req, res, emit }) =>
    handleAttachments(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
      deps.vfs
        ? stagedUploads(deps.uploadSessions, deps.vfs, {
            agentId: authz.agent.id,
            workspace: authz.workspace.id,
            owner: userId,
            purpose: "attachment",
          })
        : undefined,
    ),
});
