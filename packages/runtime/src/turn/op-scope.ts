import { posix } from "node:path";
import { agentScopeIncludes } from "./turn-agent-scope";
import type { TurnFilesystem } from "./turn-filesystem";

/**
 * Leaf module — op-apply and op-route both need these, and op-apply already
 * imports op-route for dispatch. Keeping the shared scope helpers in either
 * of them closes an import cycle, which the esbuild bundle (selfhost
 * bundle.mjs) turns into a boot deadlock once any module in the graph uses
 * top-level await: each side's evaluation awaits the other's forever, the
 * event loop empties, and the worker exits without a line of output. Plain
 * ESM (tsx/node on sources) tolerates the cycle, so only bundled pool
 * workers died. Nothing here may import another ./op-* module.
 */

/** The shape of `OpResult["include"]` without importing op-apply. */
export type OpInclude = (relativePath: string) => boolean;

/** Everything an agent-level route may touch: the agent's whole directory
 *  (family files, skills, markdown, any agentfile path the pod would
 *  accept) — never the runtime tree (conversations, sessions, auth), which
 *  stays conversation-scoped. Mirrors the pod-store's ops-claim scope. */
export function agentRouteScope(workspaceRel: string): OpInclude {
  return (relativePath) => agentScopeIncludes(relativePath, workspaceRel);
}

/** One conversation's file + sessions. */
export function conversationScope(dataRel: string, cid: string): OpInclude {
  const file = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(cid)}.json`,
  );
  const sessions = `${posix.join(dataRel, "sessions", cid)}/`;
  return (rel) => rel === file || rel.startsWith(sessions);
}

/**
 * The engine's agent id ("Workspace/Agent") from the hydrated layout. The
 * gateway's envelope names the agent by SLUG; turns never need the engine
 * id (the layout resolver finds the single agent), but the host handlers
 * address the agent by its id — so it is derived here, never trusted.
 */
export function engineAgentId(filesystem: TurnFilesystem): string {
  return filesystem.workspaceRel.replace(/^workspaces\//, "");
}
