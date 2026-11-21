import { useMemo } from "react";
import type { Agent, SkillSummary } from "../../lib/types";
import type { ManagedSkillRow } from "./skill-editor-props";
import { resolveScopedOverrides, scopeSkillRows } from "./skills-scope";

export function useScopedSkillRows(
  rows: ManagedSkillRow[],
  listsByPath: Map<string, SkillSummary[] | undefined>,
  agent: Agent,
): ManagedSkillRow[] {
  const locals = useMemo(() => {
    const list = listsByPath.get(agent.folderPath);
    if (list === undefined) return undefined;
    const bySlug = new Map<string, SkillSummary>();
    for (const summary of list) bySlug.set(summary.name, summary);
    return bySlug;
  }, [agent, listsByPath]);

  return useMemo(
    () =>
      resolveScopedOverrides(scopeSkillRows(rows, agent.id), agent.id, locals),
    [rows, agent, locals],
  );
}
