import type {
  PortableExportSelection,
  PortableInventoryPreview,
} from "@houston/engine-adapter";
import { agentNameKey } from "@houston/sdk/agent-name";

export function fullPortableSelection(
  preview: PortableInventoryPreview,
): PortableExportSelection {
  return {
    includeClaudeMd: preview.claudeMd !== null,
    includeSkillSlugs: preview.skills.map((skill) => skill.slug),
    includeRoutineIds: preview.routines.map((routine) => routine.id),
    includeLearningIds: preview.learnings.map((learning) => learning.id),
  };
}

export function suggestCopyName(
  name: string,
  existingNames: readonly string[],
  copyWord: string,
  maxLength: number,
): string {
  const taken = new Set(existingNames.map(agentNameKey));
  const candidate = (n: number): string => {
    const suffix = n === 1 ? ` ${copyWord}` : ` ${copyWord} ${n}`;
    const base = name.slice(0, Math.max(1, maxLength - suffix.length)).trim();
    return `${base}${suffix}`;
  };
  for (let n = 1; n <= 99; n++) {
    const next = candidate(n);
    if (!taken.has(agentNameKey(next))) return next;
  }
  return candidate(1);
}
