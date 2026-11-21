import { skillDisplayTitle } from "./humanize-skill-name.ts";
import type { SkillSummary } from "./types.ts";

export interface WorkspaceSkillAgent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}

export interface WorkspaceSkillRow {
  slug: string;
  summary: SkillSummary;
  agents: WorkspaceSkillAgent[];
}

export function aggregateWorkspaceSkills(
  agents: readonly WorkspaceSkillAgent[],
  listsByPath: ReadonlyMap<string, readonly SkillSummary[] | undefined>,
): WorkspaceSkillRow[] {
  const bySlug = new Map<string, WorkspaceSkillRow>();
  for (const agent of agents) {
    for (const summary of listsByPath.get(agent.folderPath) ?? []) {
      const row = bySlug.get(summary.name);
      if (row) row.agents.push(agent);
      else
        bySlug.set(summary.name, {
          slug: summary.name,
          summary,
          agents: [agent],
        });
    }
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function filterWorkspaceSkills<T extends WorkspaceSkillRow>(
  rows: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (row) =>
      skillDisplayTitle(row.summary).toLowerCase().includes(q) ||
      row.slug.toLowerCase().includes(q) ||
      row.agents.some((a) => a.name.toLowerCase().includes(q)),
  );
}

export interface SkillAssignmentPlan {
  writes: string[];
  deletes: string[];
}

export function planSkillAssignment(args: {
  contentDirty: boolean;
  before: readonly string[];
  after: readonly string[];
}): SkillAssignmentPlan {
  const before = new Set(args.before);
  const after = new Set(args.after);
  const writes = [...after].filter(
    (path) => args.contentDirty || !before.has(path),
  );
  const deletes = [...before].filter((path) => !after.has(path));
  return { writes, deletes };
}
