import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HydrateListedObject } from "@houston/runtime-client/object-sync";
import { CONVERSATION_MARK_FILES } from "../session/conversation-marks";
import { ROUTINE_RESULTS_FILE } from "../store/routine-results";
import { CLAUDE_FLAGS_DIR, claudeFlagsFileName } from "./claude-flags-path";

export const PI_SESSION_FALLBACK_MAX_BYTES = 1024 * 1024;

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

function ownFlagsFile(
  segments: string[],
  runtimeAt: number,
  ownFlags: string | null,
): boolean {
  return (
    segments.length === runtimeAt + 2 && segments[runtimeAt + 1] === ownFlags
  );
}

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

export function ownConversationOnly(
  conversationId: string,
  actingUserId?: string,
): (
  rel: string,
  listing: readonly HydrateListedObject[],
  hydratedRoot: string,
) => boolean {
  const file = `${encodeURIComponent(conversationId)}.json`;
  const ownFlags = actingUserId ? claudeFlagsFileName(actingUserId) : null;
  let claudeSelection: { file: string | null } | undefined;
  return (rel, listing, hydratedRoot) => {
    const segments = rel.split("/");
    const runtimeAt = runtimeIndex(segments);
    if (runtimeAt === -1) return true;
    const kind = segments[runtimeAt];
    const own = segments[runtimeAt + 1];
    if (kind === CLAUDE_FLAGS_DIR)
      return ownFlagsFile(segments, runtimeAt, ownFlags);
    if (kind === "conversations") {
      return segments.length === runtimeAt + 2 && own === file;
    }
    if (kind === "sessions" && segments.length > runtimeAt + 1) {
      if (own !== conversationId) return false;
      const sessionAt = runtimeAt + 2;
      const sessionRel = segments.slice(0, sessionAt).join("/");
      const tail = segments.slice(sessionAt);
      if (
        tail.length === 1 &&
        (tail[0] === "harness.json" ||
          tail[0] === "autocompact.json" ||
          tail[0] === ROUTINE_RESULTS_FILE ||
          CONVERSATION_MARK_FILES.has(tail[0] ?? ""))
      )
        return true;
      if (tail.length === 1 && tail[0]?.endsWith(".jsonl")) {
        const sessions = listing.filter(({ rel: candidate }) => {
          const candidateSegments = candidate.split("/");
          return (
            candidateSegments.length === sessionAt + 1 &&
            candidate.startsWith(`${sessionRel}/`) &&
            candidate.endsWith(".jsonl")
          );
        });
        const ordered = sessions.toSorted((a, b) =>
          a.rel === b.rel ? 0 : a.rel < b.rel ? -1 : 1,
        );
        if (ordered.at(-1)?.rel === rel) return true;
        const fallback = ordered.at(-2);
        return (
          fallback?.rel === rel &&
          fallback.size !== undefined &&
          fallback.size <= PI_SESSION_FALLBACK_MAX_BYTES
        );
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
      return false;
    }
    return true;
  };
}
