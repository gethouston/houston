import type { SkillSummary } from "../../lib/types";

interface ScopedSkillRow {
  agents: readonly { id: string }[];
}

export function scopeSkillRows<T extends ScopedSkillRow>(
  rows: readonly T[],
  agentId: string,
): T[] {
  return rows.filter((row) => row.agents.some((a) => a.id === agentId));
}

interface OverridableSkillRow {
  slug: string;
  summary: SkillSummary;
  origin?: "shared" | "local";
  agents: readonly { id: string }[];
  overriddenBy?: readonly { id: string }[];
}

export function resolveScopedOverrides<T extends OverridableSkillRow>(
  rows: readonly T[],
  agentId: string,
  localsBySlug: ReadonlyMap<string, SkillSummary> | undefined,
): T[] {
  if (localsBySlug === undefined) return [...rows];
  const resolved: T[] = [];
  for (const row of rows) {
    const mine = (row.overriddenBy ?? []).filter((a) => a.id === agentId);
    if (row.origin !== "shared" || mine.length === 0) {
      resolved.push(row);
      continue;
    }
    const local = localsBySlug.get(row.slug);
    if (local === undefined) continue;
    resolved.push({
      ...row,
      origin: "local" as const,
      summary: local,
      agents: row.agents.filter((a) => a.id === agentId),
      overriddenBy: mine,
    });
  }
  return resolved;
}
