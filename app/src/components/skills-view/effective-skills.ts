import type { SkillSummary } from "../../lib/types";

/**
 * What each AI Employee actually RUNS, kept pure so the surface stays a
 * renderer.
 *
 * A workspace skill lives once in the store (ADR 0003) and an employee loads it
 * through its manifest, so the employee's own `.agents/skills/` list is only
 * half of what it follows. The setup chat resolves a skill by slug out of the
 * list it is handed, so handing it the copies alone leaves a workspace skill
 * just added to that employee with no chat that can ever start.
 */

/** The slice of a workspace row this fold reads. */
interface EffectiveSkillRow {
  summary: SkillSummary;
  /** The employees the row is live on. */
  agents: readonly { folderPath: string }[];
}

export function effectiveSkillsByPath(args: {
  /** Every workspace row, BEFORE any scope narrows it. */
  rows: readonly EffectiveSkillRow[];
  /** folderPath → that employee's own copies; undefined while still loading. */
  listsByPath: ReadonlyMap<string, readonly SkillSummary[] | undefined>;
}): Map<string, SkillSummary[] | undefined> {
  const byPath = new Map<string, SkillSummary[] | undefined>();
  for (const [path, own] of args.listsByPath) {
    if (own === undefined) {
      // Undefined is the chat's "still loading": an empty list there would
      // read as "this employee has nothing" and settle the claim heuristics
      // against a list that had not arrived.
      byPath.set(path, undefined);
      continue;
    }
    // The employee's own copy wins on a shared slug: it is the one that loads.
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
