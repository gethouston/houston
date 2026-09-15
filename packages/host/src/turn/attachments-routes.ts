import { DEFAULT_PATHS } from "../routes/agent-authz";
import { agentRest } from "../routes/agent-rest";
import { defineRoute } from "../routes/registry";
import { handleAttachments } from "./attachments";

/**
 * The composer-attachment upload as a ROUTE. The handler lives in
 * attachments.ts, which is at the file-size cap; this module is only its
 * declaration.
 *
 * The 405 is behaviour old clients depend on: they still fire a best-effort
 * DELETE when a chat is cleared, get it, and ignore it — where a fall-through
 * would proxy that DELETE to a runtime that has no attachments route.
 */
defineRoute({
  group: "attachments",
  method: "POST",
  path: "/agents/:agentId/attachments",
  methodMismatch: "405",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/turn/attachments.ts",
  handler: ({ deps, authz, method, path, req, res, emit }) =>
    handleAttachments(
      deps.vfs,
      deps.paths ?? DEFAULT_PATHS,
      authz,
      method,
      agentRest(path),
      req,
      res,
      emit,
    ),
});
