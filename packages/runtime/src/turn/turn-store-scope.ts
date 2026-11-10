import { STARTUP_FOLDERS } from "./turn-deferred-rule";

/**
 * Store-root folders a claimed turn never lists: every pooled hydrate
 * excludes them (CLAIMED_TURN_EXCLUDES), and the package store alone can
 * hold more objects than the agent.
 */
export const UNLISTED_ROOT_DIRS: ReadonlySet<string> = new Set([
  ".pnpm-store",
  "claude-login",
]);

/**
 * What a claimed turn lists of an agent's store, under the agent tree
 * `agentRoot` (`workspaces/<ws>/<agent>`), as store-relative paths.
 *
 * - `critical`: listed before the prompt. Everything outside the agent's own
 *   folders, minus the transcripts and sessions of every other conversation
 *   (`.houston/runtime/conversations`, `.houston/runtime/sessions`), which a
 *   routine every few minutes grows by tens of thousands of objects and the
 *   turn neither reads (ownConversationOnly) nor writes (claimedTurnIncludes).
 *   The turn's own archive and session folder stay.
 * - `later`: the agent's own folders (turn-deferred-rule.ts), listed and
 *   downloaded behind the prompt. Every tool waits for them.
 * - `conversation`: the turn's own transcript, read by key: its folder holds
 *   every conversation, too many to list for one file.
 *
 * Nothing here limits writes: sync-back deletes only what landed (the
 * manifest), and claimedTurnIncludes already keeps the turn out of every
 * other conversation's files. This is the worker's own walk; a gateway
 * prefetch is not built from it. The prefetched `manifest` may leave out
 * other conversations' transcripts and sessions, and the worker hydrates
 * from it as the listing (PrefetchedObjects).
 */
export interface ClaimedStoreScope {
  agentRoot: string;
  conversation: string;
  critical(rel: string): boolean;
  later(rel: string): boolean;
  /** A folder directly in the agent tree whose files are `later`. */
  laterFolder(dir: string): boolean;
}

export function claimedStoreScope(
  agentRoot: string,
  conversationId: string,
): ClaimedStoreScope {
  const root = `${agentRoot}/`;
  const runtime = `${root}.houston/runtime/`;
  const conversation = `${runtime}conversations/${encodeURIComponent(conversationId)}.json`;
  const archive = `${runtime}conversations/${encodeURIComponent(conversationId)}.archive/`;
  const session = `${runtime}sessions/${conversationId}/`;
  const later = (rel: string) => {
    if (!rel.startsWith(root)) return false;
    const segments = rel.slice(root.length).split("/");
    return segments.length > 1 && !STARTUP_FOLDERS.has(segments[0] ?? "");
  };
  const critical = (rel: string) => {
    if (!rel.startsWith(root)) {
      const [top, ...rest] = rel.split("/");
      return rest.length === 0 || !UNLISTED_ROOT_DIRS.has(top ?? "");
    }
    if (later(rel)) return false;
    for (const folder of ["conversations/", "sessions/"]) {
      if (!rel.startsWith(runtime + folder)) continue;
      // Only the turn's own subfolders: never a file directly inside, which
      // is every transcript (the turn's own is read by key).
      return rel.startsWith(archive) || rel.startsWith(session);
    }
    return true;
  };
  return {
    agentRoot,
    conversation,
    critical,
    later,
    laterFolder: (dir) =>
      later(`${dir}/file`) && !dir.slice(root.length).includes("/"),
  };
}
