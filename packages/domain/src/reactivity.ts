import type { HoustonEvent } from "@houston/protocol";

/**
 * Map an agent-relative path (the part AFTER `<Workspace>/<Agent>/`, e.g.
 * `.houston/config/config.json` or `CLAUDE.md`) to the reactivity event a
 * mutation of that path should raise.
 *
 * This is the ONE classification shared by the cloud/local host's file watcher
 * (`packages/host/src/watch/classify.ts`, which prepends the agent prefix) and
 * the web engine-adapter's write-through echo
 * (`packages/web/src/engine-adapter/client.ts`). Keeping it in the shared domain
 * means the watcher and the echo can never drift into disagreeing about which
 * file raises which event.
 *
 * Order matters: `routine_runs` must be tested before `routines` (prefix
 * overlap). Returns null for paths not worth an event (`.git/**`, `.DS_Store`).
 */
/**
 * The events a file mutation can raise — exactly the plain
 * `{ type, agentPath }` variants of {@link HoustonEvent}, so callers can pair
 * the returned type with an agentPath and get a valid event without casting.
 */
export type AgentFileChangeEvent = Extract<
  HoustonEvent,
  {
    type:
      | "RoutineRunsChanged"
      | "RoutinesChanged"
      | "ActivityChanged"
      | "ConfigChanged"
      | "LearningsChanged"
      | "ConversationsChanged"
      | "SkillsChanged"
      | "ContextChanged"
      | "FilesChanged";
  }
>;

export function agentFileEventType(
  relPath: string,
): AgentFileChangeEvent["type"] | null {
  if (relPath.startsWith(".houston/routine_runs")) return "RoutineRunsChanged";
  if (relPath.startsWith(".houston/routines")) return "RoutinesChanged";
  if (relPath.startsWith(".houston/activity")) return "ActivityChanged";
  if (relPath.startsWith(".houston/config")) return "ConfigChanged";
  if (relPath.startsWith(".houston/learnings")) return "LearningsChanged";
  if (
    relPath.startsWith(".houston/conversations") ||
    relPath.startsWith(".houston/sessions")
  ) {
    return "ConversationsChanged";
  }
  if (
    relPath.startsWith(".agents/skills") ||
    relPath.startsWith(".houston/skills") ||
    relPath.startsWith(".claude/skills")
  ) {
    return "SkillsChanged";
  }
  if (
    relPath === "CLAUDE.md" ||
    relPath === "AGENTS.md" ||
    relPath === "GEMINI.md"
  )
    return "ContextChanged";
  // Internal bookkeeping we never surface.
  if (relPath.startsWith(".git/") || relPath === ".DS_Store") return null;
  // Any other file in the agent's working tree.
  return "FilesChanged";
}
