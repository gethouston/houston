import type { HydrateListedObject } from "@houston/runtime-client/object-sync";

function runtimeIndex(segments: string[]): number {
  if (segments[0] === "data") return 1;
  if (
    segments[0] === "workspaces" &&
    segments[3] === ".houston" &&
    segments[4] === "runtime"
  )
    return 5;
  return -1;
}

function newestByName(paths: string[]): string | undefined {
  return paths.toSorted().at(-1);
}

function newestClaudeTranscript(
  listing: readonly HydrateListedObject[],
  prefix: string,
): string | undefined {
  const candidates = listing.filter(
    ({ rel }) => rel.startsWith(`${prefix}/`) && rel.endsWith(".jsonl"),
  );
  // UUID filenames carry no chronology. Legacy/list-only stores may provide no
  // `updated`, so incomplete metadata must fail open to continuity.
  if (candidates.some(({ updated }) => !updated)) return undefined;
  return candidates
    .toSorted(
      (left, right) =>
        (left.updated as string).localeCompare(right.updated as string) ||
        left.rel.localeCompare(right.rel),
    )
    .at(-1)?.rel;
}

/**
 * Hot-set admission for one conversation: its canonical conversation,
 * harness markers, and newest backend session tails. Other conversations and
 * older session files never need to hydrate for a claimed turn.
 * Matches both layouts: `workspaces/<ws>/<agent>/.houston/runtime/…` and
 * the per-turn `data/…`.
 */
export function ownConversationOnly(
  conversationId: string,
): (rel: string, listing?: readonly HydrateListedObject[]) => boolean {
  const file = `${encodeURIComponent(conversationId)}.json`;
  return (rel, listing = []) => {
    const segments = rel.split("/");
    const runtimeAt = runtimeIndex(segments);
    if (runtimeAt === -1) return true;
    const kind = segments[runtimeAt];
    const own = segments[runtimeAt + 1];
    if (kind === "conversations" && segments.length === runtimeAt + 2) {
      return own === file;
    }
    if (kind === "sessions" && segments.length > runtimeAt + 1) {
      if (own !== conversationId) return false;
      const sessionAt = runtimeAt + 2;
      const sessionRel = segments.slice(0, sessionAt).join("/");
      const tail = segments.slice(sessionAt);
      if (tail.length === 1 && tail[0] === "harness.json") return true;
      if (tail.length === 1 && tail[0]?.endsWith(".jsonl")) {
        const sessions = listing
          .map(({ rel: candidate }) => candidate)
          .filter((candidate) => {
            const candidateSegments = candidate.split("/");
            return (
              candidateSegments.length === sessionAt + 1 &&
              candidate.startsWith(`${sessionRel}/`) &&
              candidate.endsWith(".jsonl")
            );
          });
        return listing.length === 0 || rel === newestByName(sessions);
      }
      const claudeRel = tail.join("/");
      if (claudeRel === "claude/sessions.json") return true;
      if (claudeRel.startsWith("claude/projects/")) {
        const newest = newestClaudeTranscript(
          listing,
          `${sessionRel}/claude/projects`,
        );
        return listing.length === 0 || newest === undefined || rel === newest;
      }
      // Pi's SessionManager writes and discovers only direct `*.jsonl` files;
      // backend.ts enforces the same resume filter, and turn-harness-state.ts
      // is Houston's only other direct-file writer (`harness.json`).
      return false;
    }
    return true;
  };
}
