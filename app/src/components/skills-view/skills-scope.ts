import type { SkillSummary } from "../../lib/types";

/**
 * The decisions that separate the Skills surface's two scopes, kept pure so
 * they are node-testable and the components stay renderers.
 *
 * ONE surface serves the workspace library (every agent's skills) and an
 * agent's own Skills section in the settings rail (that agent's skills). The
 * scope is the only thing that differs between them, so it is decided here
 * rather than in two components that would drift apart.
 */

/** The slice of a list row these rules read: who the skill is live on. */
interface ScopedSkillRow {
  agents: readonly { id: string }[];
}

/**
 * Narrow rows to one agent. The workspace-shared store lists every skill it
 * holds whether or not an agent loads it, so an agent's own section would
 * otherwise offer skills that agent does not have.
 */
export function scopeSkillRows<T extends ScopedSkillRow>(
  rows: readonly T[],
  agentId: string | null,
): T[] {
  if (agentId === null) return [...rows];
  return rows.filter((row) => row.agents.some((a) => a.id === agentId));
}

/** The slice of a list row the override resolution rewrites. */
interface OverridableSkillRow {
  slug: string;
  summary: SkillSummary;
  /** Where the canonical copy lives; absent where there is no store. */
  origin?: "shared" | "local";
  agents: readonly { id: string }[];
  /** Agents whose own copy shadows the store version. */
  overriddenBy?: readonly { id: string }[];
}

/**
 * Point an employee's rows at the copy that employee actually RUNS.
 *
 * A local copy of a store slug shadows the store version, so the workspace
 * aggregate folds it into the shared row as an override. Read through that row
 * the employee's own section would load, save and disable the STORE copy — a
 * save there rewrites the skill for every other employee while this one keeps
 * its untouched copy. Scoped to the employee, such a row becomes its local copy
 * instead, keeping the override mark so the editor can still offer the
 * workspace version. The library scope (`agentId === null`) reads the store.
 *
 * Until the employee's own list has landed there is nothing to resolve TO, and
 * a row rewritten to "local" while still carrying the store's title would
 * rename itself on screen the moment the list arrives. So an unread list
 * (`undefined`) leaves every row exactly as the aggregate resolved it; an
 * empty map is the answer "this employee has no copies", which is different.
 *
 * A row the two reads disagree about — the aggregate names this employee as an
 * overrider, the read list holds no such copy — is HELD BACK until they agree.
 * Listed as the store row it would open the store copy, where the editor says
 * "This is the workspace version" and a save rewrites the skill for every
 * employee while this one goes on running the copy it kept. The disagreement
 * is one read behind the other, and both refresh together.
 */
export function resolveScopedOverrides<T extends OverridableSkillRow>(
  rows: readonly T[],
  agentId: string | null,
  /** slug → the employee's own copy, or undefined while its list is loading. */
  localsBySlug: ReadonlyMap<string, SkillSummary> | undefined,
): T[] {
  if (agentId === null || localsBySlug === undefined) return [...rows];
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

/**
 * Whether the editor may offer "Share to workspace".
 *
 * Promoting moves a per-employee skill into the store and fans the move out
 * over every holder the row names. An employee's own section narrows that row
 * to itself, so promoting from there would leave the other holders on stale
 * copies that shadow the new store version, and it is a workspace-wide act
 * reached from a screen a manager sees. It belongs to the library alone.
 */
export function offersPromoteToWorkspace(input: {
  /** The agent this surface is scoped to, or null for the library. */
  scopedAgentId: string | null;
  /** Where the open row's canonical copy lives. */
  origin?: "shared" | "local";
  /** `capabilities.sharedSkills` — there is no store to promote into without it. */
  sharedStore: boolean;
}): boolean {
  return (
    input.sharedStore &&
    input.origin === "local" &&
    input.scopedAgentId === null
  );
}

/** Where a "Create skill" action lands before anything opens. */
export type SkillCreateTarget =
  | { kind: "agent"; agentId: string }
  | { kind: "choose" }
  | { kind: "none" };

/**
 * Which agent a new skill is built on. A scoped surface is already standing on
 * one, so it never asks; the library asks only when the workspace holds more
 * than one, and a workspace with none has nothing to create against.
 */
export function resolveSkillCreateTarget(input: {
  /** The agent this surface is scoped to, or null for the library. */
  scopedAgentId: string | null;
  agentIds: readonly string[];
}): SkillCreateTarget {
  if (input.scopedAgentId !== null)
    return { kind: "agent", agentId: input.scopedAgentId };
  const [only, ...rest] = input.agentIds;
  if (only === undefined) return { kind: "none" };
  return rest.length === 0
    ? { kind: "agent", agentId: only }
    : { kind: "choose" };
}
