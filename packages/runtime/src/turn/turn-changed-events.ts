import { docKey, FAMILIES, type HoustonFamily } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";

type AgentEventType = Extract<HoustonEvent, { agentPath: string }>["type"];

const FAMILY_EVENT: Record<HoustonFamily, AgentEventType> = {
  activity: "ActivityChanged",
  routines: "RoutinesChanged",
  routine_runs: "RoutineRunsChanged",
  config: "ConfigChanged",
  learnings: "LearningsChanged",
};

/**
 * The domain events a pool turn's durable writes imply, derived from the
 * store-relative keys the sync-back landed. A pod emits these from its
 * handlers; a worker has no event bus, so the written objects ARE the
 * signal. Keys with no client-visible cache (sessions, runtime state) map to
 * nothing. Sorted, each type once: the list is a set on the wire.
 */
export function changedEventTypes(
  layout: { workspaceRel: string; dataRel: string },
  keys: readonly string[],
): AgentEventType[] {
  const familyByKey = new Map<string, AgentEventType>(
    FAMILIES.map((family) => [
      docKey(layout.workspaceRel, family),
      FAMILY_EVENT[family],
    ]),
  );
  const conversations = `${layout.dataRel}/conversations/`;
  const files = `${layout.workspaceRel}/files/`;
  const skills = `${layout.workspaceRel}/.agents/skills/`;
  const out = new Set<AgentEventType>();
  for (const key of keys) {
    const family = familyByKey.get(key);
    if (family) out.add(family);
    else if (key.startsWith(conversations)) out.add("ConversationsChanged");
    else if (key.startsWith(files)) out.add("FilesChanged");
    else if (key.startsWith(skills)) out.add("SkillsChanged");
  }
  return [...out].sort();
}
