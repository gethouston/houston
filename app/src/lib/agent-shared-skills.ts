import type { SkillSummary } from "./types.ts";

/**
 * The pure model behind an agent's OWN skill list on shared-store deployments
 * (ADR 0003): a store skill the agent's manifest enables is the agent's skill
 * — it loads at runtime — so the "Your skills" surface must show it. A local
 * copy of the same slug shadows the store version (the override mechanism)
 * and already appears as itself, so it never merges twice. Node-test covered.
 */
export function mergeSharedIntoAgentSkills(args: {
  /** The agent's on-disk skills (`.agents/skills/`). */
  local: readonly SkillSummary[];
  /** The workspace store's skills. */
  shared: readonly SkillSummary[];
  /** Store slugs this agent's manifest enables. */
  enabled: ReadonlySet<string>;
}): {
  /** Local skills plus the enabled, un-shadowed store skills. */
  skills: SkillSummary[];
  /** Lowercase slugs of the merged-in store skills — rows that must route to
   *  the workspace preview, never to the per-agent copy dialog. */
  sharedNames: Set<string>;
} {
  const localNames = new Set(args.local.map((s) => s.name.toLowerCase()));
  const merged = args.shared.filter(
    (s) => args.enabled.has(s.name) && !localNames.has(s.name.toLowerCase()),
  );
  return {
    skills: [...args.local, ...merged],
    sharedNames: new Set(merged.map((s) => s.name.toLowerCase())),
  };
}
