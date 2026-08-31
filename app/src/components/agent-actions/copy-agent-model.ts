import type {
  PortableExportSelection,
  PortableInventoryPreview,
} from "@houston-ai/engine-client";

/**
 * The pure rules behind "Copy agent": what a copy carries and what name it is
 * born under. Unit-tested in `app/tests/copy-agent-model.test.ts`.
 */

/**
 * Everything the portable preview offers, as the wire selection. A copy is
 * faithful, not curated: the whole portable surface (job description, skills,
 * routines, learnings) rides along. Conversations, files and connected
 * accounts are not part of that surface, which is exactly why the copy never
 * carries them.
 */
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

/**
 * The first free "<name> <copyWord>" / "<name> <copyWord> N" against the
 * workspace's names. Case-insensitive because agent folders land on
 * case-insensitive filesystems (the same rule `agentNameIssue` applies), and
 * capped at `maxLength` by trimming the BASE name — the suffix is what keeps
 * candidates distinct, so it must survive whole.
 *
 * When every candidate is taken the plain first one is returned anyway: the
 * dialog's live validation names the conflict and asks for a rename, which is
 * more honest than inventing an unrelated name.
 */
export function suggestCopyName(
  name: string,
  existingNames: readonly string[],
  copyWord: string,
  maxLength: number,
): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const candidate = (n: number): string => {
    const suffix = n === 1 ? ` ${copyWord}` : ` ${copyWord} ${n}`;
    const base = name.slice(0, Math.max(1, maxLength - suffix.length)).trim();
    return `${base}${suffix}`;
  };
  for (let n = 1; n <= 99; n++) {
    const next = candidate(n);
    if (!taken.has(next.toLowerCase())) return next;
  }
  return candidate(1);
}
