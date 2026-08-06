import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** agent.id is "<Workspace>/<Agent>" — split it back into the on-disk dir. */
export function agentDirFor(workspacesRoot: string, id: string): string {
  return join(workspacesRoot, ...id.split("/"));
}

/**
 * Resolve the directory a runtime may spawn against, failing closed on a
 * stale id: after a rename (or delete) the old id maps to a directory that no
 * longer exists, and a runtime spawned against it would recreate the tree on
 * its first mkdir-recursive write — the HOU-827 ghost agent. Any late dispatch
 * still holding the old id (client caches, a scheduler tick that crossed the
 * rename) errors visibly instead.
 *
 * ONE carve-out: the hidden setup runtime's synthetic agent
 * (`<ws>/.setup/connect`, routes/setup-runtime.ts) has no create path — its
 * directory only ever exists because a spawn made it. Nothing user-facing can
 * create, rename, or delete it, so the stale-id protection cannot apply;
 * without the carve-out, first-run provider connect on a fresh cloud account
 * 500s before any agent exists (HOU-1239).
 */
export function liveAgentDirFor(workspacesRoot: string, id: string): string {
  const dir = agentDirFor(workspacesRoot, id);
  if (!existsSync(dir)) {
    if (id.split("/").includes(".setup")) {
      mkdirSync(dir, { recursive: true });
      return dir;
    }
    throw new Error(
      `agent directory for '${id}' is gone (renamed or deleted?)`,
    );
  }
  return dir;
}
