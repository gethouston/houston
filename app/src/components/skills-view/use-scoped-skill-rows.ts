import { useMemo } from "react";
import type { Agent, SkillSummary } from "../../lib/types";
import type { ManagedSkillRow } from "./skill-editor-props";
import { resolveScopedOverrides, scopeSkillRows } from "./skills-scope";

/**
 * The rows one scope of the Skills surface lists: the whole workspace
 * aggregate for the library, or — scoped to an AI Employee — the skills that
 * employee is live on, each already pointing at the copy it actually runs, and
 * a skill whose copy the two reads disagree about held back until they agree.
 *
 * Both steps are pure ({@link scopeSkillRows}, {@link resolveScopedOverrides});
 * this only feeds them the employee's own list and memoizes the result the
 * editor's row resolution rides on.
 */
export function useScopedSkillRows(
  rows: ManagedSkillRow[],
  listsByPath: Map<string, SkillSummary[] | undefined>,
  agent: Agent | null,
): ManagedSkillRow[] {
  // Undefined until the employee's own list has been READ: an empty map would
  // say "this employee keeps no copies", and the rows would resolve to a copy
  // that has not been looked for yet.
  const locals = useMemo(() => {
    const list = agent === null ? undefined : listsByPath.get(agent.folderPath);
    if (list === undefined) return undefined;
    const bySlug = new Map<string, SkillSummary>();
    for (const summary of list) bySlug.set(summary.name, summary);
    return bySlug;
  }, [agent, listsByPath]);

  return useMemo(
    () =>
      resolveScopedOverrides(
        scopeSkillRows(rows, agent?.id ?? null),
        agent?.id ?? null,
        locals,
      ),
    [rows, agent, locals],
  );
}
