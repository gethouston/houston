import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed } from "./http";
import { defineRouteFamily } from "./registry";
import { repoListAction } from "./skills-remote";

/**
 * The top-level spelling of the GitHub repo listing, for direct host API
 * callers. It touches no workspace, so the same action answers here and
 * agent-scoped (routes/skills-remote.ts) — the shipped clients call the
 * agent-scoped twin because the hosted gateway proxies ONLY /agents/:slug/*.
 */

const REPO_LIST_PATH = "/v1/skills/repo/list";

/** Top-level (user-scoped, post-auth) repo listing. Returns true when handled. */
export async function handleSkillsRepoList(
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  if (path !== REPO_LIST_PATH) return false;
  if (method !== "POST") {
    methodNotAllowed(res);
    return true;
  }
  await repoListAction(req, res, deps.fetchImpl ?? fetch);
  return true;
}

/**
 * One member, `owns`ed for every method: the handler answers the blanket 405
 * itself, so a GET on this path never falls through to the chain's 404.
 */
defineRouteFamily({
  group: "skills-repo-list",
  members: [{ method: "POST", path: REPO_LIST_PATH }],
  owns: [REPO_LIST_PATH],
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/skills-repo-list.ts",
  handler: async ({ method, path, req, res }) => {
    await handleSkillsRepoList(method, path, req, res);
  },
});
