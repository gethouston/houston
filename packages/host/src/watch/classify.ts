import type { HoustonEvent } from "@houston/protocol";

/**
 * Map a changed path (relative to `~/.houston/workspaces`) to a reactivity
 * event — the local analog of the cloud host's post-mutation emits, matching
 * engine/houston-file-watcher's classification. The agentPath is the
 * `<Workspace>/<Agent>` prefix (the agent's opaque key locally).
 *
 * Returns null for paths not inside an agent or not worth an event.
 */
export function classifyChange(relPath: string): HoustonEvent | null {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  if (parts.length < 3) return null; // need <Workspace>/<Agent>/<something>
  const agentPath = `${parts[0]}/${parts[1]}`;
  const rest = parts.slice(2).join("/");
  const type = eventTypeFor(rest);
  return type ? ({ type, agentPath } as HoustonEvent) : null;
}

function eventTypeFor(rest: string): HoustonEvent["type"] | null {
  // Order matters: routine_runs must be tested before routines (prefix overlap).
  if (rest.startsWith(".houston/routine_runs")) return "RoutineRunsChanged";
  if (rest.startsWith(".houston/routines")) return "RoutinesChanged";
  if (rest.startsWith(".houston/activity")) return "ActivityChanged";
  if (rest.startsWith(".houston/config")) return "ConfigChanged";
  if (rest.startsWith(".houston/learnings")) return "LearningsChanged";
  if (
    rest.startsWith(".houston/conversations") ||
    rest.startsWith(".houston/sessions")
  ) {
    return "ConversationsChanged";
  }
  if (
    rest.startsWith(".agents/skills") ||
    rest.startsWith(".houston/skills") ||
    rest.startsWith(".claude/skills")
  ) {
    return "SkillsChanged";
  }
  if (rest === "CLAUDE.md" || rest === "AGENTS.md" || rest === "GEMINI.md")
    return "ContextChanged";
  // Internal bookkeeping we never surface.
  if (rest.startsWith(".git/") || rest === ".DS_Store") return null;
  // Any other file in the agent's working tree.
  return "FilesChanged";
}
