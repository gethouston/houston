/**
 * Hot-set admission for one conversation: every runtime conversation file
 * and session dir that is NOT this conversation's is left out. A turn reads
 * only its own history (`conversations/<id>.json`, `sessions/<id>/`), so
 * other conversations (the bulk of a busy agent) never need to hydrate.
 * Matches both layouts: `workspaces/<ws>/<agent>/.houston/runtime/…` and
 * the per-turn `data/…`.
 */
export function ownConversationOnly(
  conversationId: string,
): (rel: string) => boolean {
  const file = `${encodeURIComponent(conversationId)}.json`;
  return (rel) => {
    const segments = rel.split("/");
    const runtimeAt =
      segments[0] === "data"
        ? 1
        : segments[0] === "workspaces" &&
            segments[3] === ".houston" &&
            segments[4] === "runtime"
          ? 5
          : -1;
    if (runtimeAt === -1) return true;
    const kind = segments[runtimeAt];
    const own = segments[runtimeAt + 1];
    if (kind === "conversations" && segments.length === runtimeAt + 2) {
      return own === file;
    }
    if (kind === "sessions" && segments.length > runtimeAt + 1) {
      return own === conversationId;
    }
    return true;
  };
}
