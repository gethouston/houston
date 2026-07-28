import { skillDisplayTitle } from "./humanize-skill-name.ts";
import type { SkillSummary } from "./types.ts";

/**
 * The pure model behind the global Skills page (HOU-792): skills live ON each
 * agent (`<agent>/.agents/skills/<slug>/`, no shared store), so the workspace
 * view is an aggregation — one row per slug, carrying which agents have a copy.
 * Node-test covered; the page stays a renderer.
 */

/** The slice of an agent the aggregation carries into a row (avatar + target). */
export interface WorkspaceSkillAgent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}

/** One workspace-level skill: the slug, a display summary, and its holders. */
export interface WorkspaceSkillRow {
  slug: string;
  /** The first holder's copy, display source for title/description/image. */
  summary: SkillSummary;
  /** Agents holding a copy, in the caller's agent order. */
  agents: WorkspaceSkillAgent[];
}

/**
 * Fold each agent's skill list into slug-keyed workspace rows. Copies of the
 * same slug on several agents collapse into ONE row (first copy wins for
 * display — divergent copies are unified visually here and physically on the
 * next global save). Rows sort by slug for a stable A-Z list; an agent with no
 * loaded list yet (query in flight) simply contributes nothing.
 */
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

/**
 * Narrow rows by the page's one search query: a case-insensitive substring
 * over the display title, the slug, and any holder's agent name (finding "what
 * does Maya know?" is a first-class query here). Empty query keeps everything.
 */
export function filterWorkspaceSkills(
  rows: readonly WorkspaceSkillRow[],
  query: string,
): WorkspaceSkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (row) =>
      skillDisplayTitle(row.summary).toLowerCase().includes(q) ||
      row.slug.toLowerCase().includes(q) ||
      row.agents.some((a) => a.name.toLowerCase().includes(q)),
  );
}

/** What one global save must do, per agent folderPath. */
export interface SkillAssignmentPlan {
  /** Agents to write the canonical SKILL.md to (full file, verbatim). */
  writes: string[];
  /** Agents whose copy is removed. */
  deletes: string[];
}

/**
 * Diff an assignment edit into the minimal write/delete fan-out. Newly
 * assigned agents always receive the canonical content; agents that already
 * hold a copy are rewritten ONLY when the user edited the content in the
 * global dialog (`contentDirty`) — an assignment-only save never clobbers a
 * divergent per-agent copy it wasn't asked to touch.
 */
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
