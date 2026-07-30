import { skillDisplayTitle } from "./humanize-skill-name.ts";
import type { SkillSummary } from "./types.ts";
import type { WorkspaceSkillAgent } from "./workspace-skills.ts";

/**
 * The pure model behind the global Skills page when the deployment serves the
 * workspace-shared store (`capabilities.sharedSkills`, ADR 0003). Shared
 * skills live ONCE at the workspace level; each agent's manifest says which
 * ones it loads, and an agent-local copy of the same slug SHADOWS the shared
 * one (the override mechanism). The copy-based model in `workspace-skills.ts`
 * remains the fallback for deployments without the store.
 */

/** One Skills-page row: a store skill, or an agent-local (per-agent) skill. */
export interface SharedSkillRow {
  slug: string;
  /** Store copy for shared rows; the first holder's copy for local rows. */
  summary: SkillSummary;
  /** Where the canonical copy lives. */
  origin: "shared" | "local";
  /**
   * Agents the row is live on, in caller order: manifest-enabled agents for
   * a shared row (plus any holder of a shadowing copy — their copy loads
   * whether or not the manifest says so), copy holders for a local row.
   */
  agents: WorkspaceSkillAgent[];
  /** Shared rows only: agents whose local copy shadows the store version. */
  overriddenBy: WorkspaceSkillAgent[];
}

/**
 * Fold the store list, per-agent manifests, and per-agent local lists into
 * one row per slug. A local copy of a store slug never creates a second row —
 * it surfaces as an override on the shared row. Rows sort by slug for a
 * stable A-Z list; an agent whose manifest or list is still loading simply
 * contributes nothing yet.
 */
export function aggregateSharedSkills(args: {
  shared: readonly SkillSummary[];
  agents: readonly WorkspaceSkillAgent[];
  /** folderPath → manifest-enabled shared slugs (undefined while loading). */
  manifestsByPath: ReadonlyMap<string, readonly string[] | undefined>;
  /** folderPath → that agent's local skill list (undefined while loading). */
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
        // A local copy shadows the store version on this agent — it is live
        // there even without a manifest entry, and it is an override.
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

/** Same search semantics as the copy-based page: title, slug, holder names. */
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

/**
 * Diff an assignment edit into per-agent manifest toggles. Unlike the
 * copy-based `planSkillAssignment`, content never fans out: a content edit is
 * ONE store write, and enabling never copies bytes — so there is no
 * `contentDirty` coupling and no divergent-copy clobbering to avoid.
 */
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
