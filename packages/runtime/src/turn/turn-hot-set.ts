import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function mappedClaudeTranscript(
  hydratedRoot: string,
  sessionsRel: string,
  conversationId: string,
  listing: readonly HydrateListedObject[],
): string | null {
  const pointerRel = `${sessionsRel}/claude/sessions.json`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readFileSync(join(hydratedRoot, ...pointerRel.split("/")), "utf8"),
    );
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  // SAFETY: JSON.parse returned a non-null, non-array object; values remain
  // unknown until the conversation's entry is refined below.
  const sessionId = (parsed as Record<string, unknown>)[conversationId];
  if (typeof sessionId !== "string" || !sessionId) return null;
  const file = `${sessionId}.jsonl`;
  const prefix = `${sessionsRel}/claude/projects/`;
  return listing.some(
    ({ rel }) => rel.startsWith(prefix) && rel.endsWith(`/${file}`),
  )
    ? file
    : null;
}

/**
 * Hot-set admission for one conversation: its canonical conversation,
 * harness markers, the two newest Pi tails, and the Claude transcript named by
 * sessions.json. Other conversations and older session files stay remote.
 * Matches both layouts: `workspaces/<ws>/<agent>/.houston/runtime/…` and
 * the per-turn `data/…`.
 *
 * Claimed stores provide manifests. The only list-only claimed fallback is
 * poolOnlyFallbackStore, whose list call fails before this filter can run.
 */
export function ownConversationOnly(
  conversationId: string,
): (
  rel: string,
  listing: readonly HydrateListedObject[],
  hydratedRoot: string,
) => boolean {
  const file = `${encodeURIComponent(conversationId)}.json`;
  let claudeSelection: { file: string | null } | undefined;
  return (rel, listing, hydratedRoot) => {
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
        return sessions.toSorted().slice(-2).includes(rel);
      }
      const claudeRel = tail.join("/");
      if (claudeRel === "claude/sessions.json") return true;
      if (claudeRel.startsWith("claude/projects/")) {
        if (!rel.endsWith(".jsonl")) return false;
        claudeSelection ??= {
          file: mappedClaudeTranscript(
            hydratedRoot,
            sessionRel,
            conversationId,
            listing,
          ),
        };
        return (
          claudeSelection.file === null ||
          rel.endsWith(`/${claudeSelection.file}`)
        );
      }
      // Pi's SessionManager writes and discovers only direct `*.jsonl` files;
      // backend.ts enforces the same resume filter, and turn-harness-state.ts
      // is Houston's only other direct-file writer (`harness.json`).
      return false;
    }
    return true;
  };
}
