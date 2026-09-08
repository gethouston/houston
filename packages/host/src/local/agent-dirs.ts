import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** agent.id is "<Workspace>/<Agent>" — split it back into the on-disk dir. */
export function agentDirFor(workspacesRoot: string, id: string): string {
  return join(workspacesRoot, ...id.split("/"));
}

/**
 * A SYNTHETIC agent: one whose id carries a dot-prefixed segment — the hidden
 * setup runtime (`<ws>/.setup/connect`, routes/setup-runtime.ts) and the
 * personal assistant (`<ws>/.assistant`, routes/assistant.ts).
 *
 * The dot is what makes them synthetic in the first place: the local store
 * lists only dot-less directories, and `validateAgentName` refuses a leading
 * dot — so no user action can create, rename, or delete one of these, and none
 * of them appears in the sidebar. `.` and `..` are excluded so a traversal
 * fragment can never buy itself the carve-out below.
 */
function isSyntheticAgentId(id: string): boolean {
  return id
    .split("/")
    .some(
      (segment) =>
        segment.startsWith(".") && segment !== "." && segment !== "..",
    );
}

/**
 * Resolve the directory a runtime may spawn against, failing closed on a
 * stale id: after a rename (or delete) the old id maps to a directory that no
 * longer exists, and a runtime spawned against it would recreate the tree on
 * its first mkdir-recursive write — the HOU-827 ghost agent. Any late dispatch
 * still holding the old id (client caches, a scheduler tick that crossed the
 * rename) errors visibly instead.
 *
 * ONE carve-out: a synthetic agent has no create path — its directory only
 * ever exists because something asked for it here. Nothing user-facing can
 * create, rename, or delete it, so the stale-id protection cannot apply;
 * without the carve-out, first-run provider connect on a fresh cloud account
 * 500s before any agent exists (HOU-1239), and the personal assistant would
 * have no home to be discovered into.
 */
export function liveAgentDirFor(workspacesRoot: string, id: string): string {
  const dir = agentDirFor(workspacesRoot, id);
  if (!existsSync(dir)) {
    if (isSyntheticAgentId(id)) {
      mkdirSync(dir, { recursive: true });
      return dir;
    }
    throw new Error(
      `agent directory for '${id}' is gone (renamed or deleted?)`,
    );
  }
  return dir;
}
