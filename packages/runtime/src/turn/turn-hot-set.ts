import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HydrateListedObject } from "@houston/runtime-client/object-sync";
import { ROUTINE_RESULTS_FILE } from "../store/routine-results";
import { CLAUDE_FLAGS_DIR, claudeFlagsFileName } from "./claude-flags-path";
import { newestArchiveSegments } from "./turn-hot-set-archive";

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

/** A runtime `claude-flags/` object is admitted only as the member's own file. */
function ownFlagsFile(
  segments: string[],
  runtimeAt: number,
  ownFlags: string | null,
): boolean {
  return (
    segments.length === runtimeAt + 2 && segments[runtimeAt + 1] === ownFlags
  );
}

/**
 * Every object except other members' Claude flag caches: the whole-tree
 * hydrate an unclaimed turn does still never lands another member's cache.
 */
export function ownClaudeFlagsOnly(
  actingUserId?: string,
): (rel: string) => boolean {
  const ownFlags = actingUserId ? claudeFlagsFileName(actingUserId) : null;
  return (rel) => {
    const segments = rel.split("/");
    const runtimeAt = runtimeIndex(segments);
    return (
      runtimeAt === -1 ||
      segments[runtimeAt] !== CLAUDE_FLAGS_DIR ||
      ownFlagsFile(segments, runtimeAt, ownFlags)
    );
  };
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
 * Hot-set admission for one conversation: its canonical conversation and the
 * newest of its own archive segments, harness markers, the two newest Pi tails, the Claude
 * transcript named by sessions.json, and the acting member's Claude flag
 * cache. Other
 * conversations, older session files, and other members' caches stay remote.
 * Matches both layouts: `workspaces/<ws>/<agent>/.houston/runtime/…` and
 * the per-turn `data/…`.
 *
 * Claimed stores provide manifests. The only list-only claimed fallback is
 * poolOnlyFallbackStore, whose list call fails before this filter can run.
 */
export function ownConversationOnly(
  conversationId: string,
  actingUserId?: string,
): (
  rel: string,
  listing: readonly HydrateListedObject[],
  hydratedRoot: string,
) => boolean {
  const file = `${encodeURIComponent(conversationId)}.json`;
  const archive = `${encodeURIComponent(conversationId)}.archive`;
  const ownFlags = actingUserId ? claudeFlagsFileName(actingUserId) : null;
  let claudeSelection: { file: string | null } | undefined;
  const eagerSegments = new Map<string, Set<string>>();
  return (rel, listing, hydratedRoot) => {
    const segments = rel.split("/");
    const runtimeAt = runtimeIndex(segments);
    if (runtimeAt === -1) return true;
    const kind = segments[runtimeAt];
    const own = segments[runtimeAt + 1];
    // Another member's flag cache is theirs alone: never on this turn's disk.
    if (kind === CLAUDE_FLAGS_DIR)
      return ownFlagsFile(segments, runtimeAt, ownFlags);
    if (kind === "conversations" && segments.length === runtimeAt + 2) {
      return own === file;
    }
    // Archive segments (store/conversation-archive.ts) ride with their own
    // conversation only, and only the newest of them. A shared routine
    // chat's archive grows by a segment every ~6 MiB of runs and never
    // shrinks, so every run downloading all of them grew without bound.
    if (kind === "conversations") {
      if (segments.length !== runtimeAt + 3 || own !== archive) return false;
      const archiveRel = segments.slice(0, runtimeAt + 2).join("/");
      let newest = eagerSegments.get(archiveRel);
      if (!newest) {
        newest = newestArchiveSegments(listing, archiveRel);
        eagerSegments.set(archiveRel, newest);
      }
      return newest.has(rel);
    }
    if (kind === "sessions" && segments.length > runtimeAt + 1) {
      if (own !== conversationId) return false;
      const sessionAt = runtimeAt + 2;
      const sessionRel = segments.slice(0, sessionAt).join("/");
      const tail = segments.slice(sessionAt);
      // Houston's own per-conversation files: the harness that last ran it, a
      // failed autocompact's cooldown (turn-autocompact.ts), and a routine
      // chat's earlier replies its digest points at (store/routine-results.ts).
      if (
        tail.length === 1 &&
        (tail[0] === "harness.json" ||
          tail[0] === "autocompact.json" ||
          tail[0] === ROUTINE_RESULTS_FILE)
      )
        return true;
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
      // backend.ts enforces the same resume filter, and the files above are
      // Houston's only other direct-file writers.
      return false;
    }
    return true;
  };
}
