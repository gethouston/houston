import type { HoustonEvent } from "@houston/protocol";

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
    relPath.startsWith(".houston/runtime/conversations") ||
    relPath.startsWith(".houston/runtime/sessions")
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
    relPath === "GEMINI.md" ||
    relPath === "WORKSPACE.md" ||
    relPath === "USER.md"
  )
    return "ContextChanged";
  if (relPath.startsWith(".git/") || relPath === ".DS_Store") return null;
  return "FilesChanged";
}
