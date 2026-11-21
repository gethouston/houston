import { skillDisplayTitle } from "./humanize-skill-name.ts";
import type { SkillSummary } from "./types.ts";
import type { WorkspaceSkillAgent } from "./workspace-skills.ts";

export interface SharedSkillRow {
  slug: string;
  summary: SkillSummary;
  origin: "shared" | "local";
  agents: WorkspaceSkillAgent[];
  overriddenBy: WorkspaceSkillAgent[];
}

export function aggregateSharedSkills(args: {
  shared: readonly SkillSummary[];
  agents: readonly WorkspaceSkillAgent[];
  manifestsByPath: ReadonlyMap<string, readonly string[] | undefined>;
  listsByPath: ReadonlyMap<string, readonly SkillSummary[] | undefined>;
}): SharedSkillRow[] {
  const rows = new Map<string, SharedSkillRow>();
  for (const summary of args.shared) {
    rows.set(summary.name, {
      slug: summary.name,
      summary,
      origin: "shared",
      agents: [],
      overriddenBy: [],
    });
  }
  for (const agent of args.agents) {
    const enabled = new Set(args.manifestsByPath.get(agent.folderPath) ?? []);
    for (const row of rows.values()) {
      if (enabled.has(row.slug)) row.agents.push(agent);
    }
    for (const summary of args.listsByPath.get(agent.folderPath) ?? []) {
      const row = rows.get(summary.name);
      if (row?.origin === "shared") {
        row.overriddenBy.push(agent);
        if (!row.agents.includes(agent)) row.agents.push(agent);
      } else if (row) {
        row.agents.push(agent);
      } else {
        rows.set(summary.name, {
          slug: summary.name,
          summary,
          origin: "local",
          agents: [agent],
          overriddenBy: [],
        });
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function filterSharedSkills(
  rows: readonly SharedSkillRow[],
  query: string,
): SharedSkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (row) =>
      skillDisplayTitle(row.summary).toLowerCase().includes(q) ||
      row.slug.toLowerCase().includes(q) ||
      row.agents.some((a) => a.name.toLowerCase().includes(q)),
  );
}

export function planManifestAssignment(args: {
  before: readonly string[];
  after: readonly string[];
}): { enable: string[]; disable: string[] } {
  const before = new Set(args.before);
  const after = new Set(args.after);
  return {
    enable: [...after].filter((path) => !before.has(path)),
    disable: [...before].filter((path) => !after.has(path)),
  };
}
