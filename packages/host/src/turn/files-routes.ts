import { DEFAULT_PATHS } from "../routes/agent-authz";
import { agentRest } from "../routes/agent-rest";
import { defineRouteFamily } from "../routes/registry";
import { handleFiles } from "./files";

/**
 * The Files tab as ROUTES. The handler itself lives in files.ts, which is at
 * the file-size cap; this module is only its declaration.
 *
 * `owns` carries the boundary the handler has always kept: EVERY `files*` path
 * is answered here, unknown subpath and wrong method included, because the
 * agent's runtime has no files route either — forwarding one would turn a
 * plain "not found" into a runtime error about something else entirely.
 */
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
  handler: ({ deps, authz, method, path, url, req, res, emit }) =>
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
    ),
});
