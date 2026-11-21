import type { SkillSummary } from "../../lib/types";

interface EffectiveSkillRow {
  summary: SkillSummary;
  agents: readonly { folderPath: string }[];
}

export function effectiveSkillsByPath(args: {
  rows: readonly EffectiveSkillRow[];
  listsByPath: ReadonlyMap<string, readonly SkillSummary[] | undefined>;
}): Map<string, SkillSummary[] | undefined> {
  const byPath = new Map<string, SkillSummary[] | undefined>();
  for (const [path, own] of args.listsByPath) {
    if (own === undefined) {
      byPath.set(path, undefined);
      continue;
    }
    const slugs = new Set(own.map((summary) => summary.name));
    const effective = [...own];
    for (const row of args.rows) {
      if (slugs.has(row.summary.name)) continue;
      if (!row.agents.some((agent) => agent.folderPath === path)) continue;
      slugs.add(row.summary.name);
      effective.push(row.summary);
    }
    byPath.set(path, effective);
  }
  return byPath;
}
