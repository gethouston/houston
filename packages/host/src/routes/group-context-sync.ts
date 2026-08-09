import type { SidebarLayout } from "@houston/protocol";
import type { Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

/** The per-agent mirror file each team's shared context is written to. */
const GROUP_CONTEXT_FILE = "GROUP.md";

/** A layout's default-team context, normalized: blank and absent are the same
 *  thing (no context), exactly as they are for a named group. */
const defaultContextOf = (layout: SidebarLayout): string =>
  layout.defaultContext?.trim() ?? "";

/**
 * Agent ids the layout places in a NAMED group — whether or not that group has
 * a context of its own. These are exactly the agents the DEFAULT team does not
 * hold: the default team is "everyone in no named group", the same rule the
 * client's `resolveSidebarSections` draws the rail with.
 */
function groupedAgentIds(layout: SidebarLayout): Set<string> {
  const ids = new Set<string>();
  for (const group of layout.groups)
    for (const agentId of group.agentIds) ids.add(agentId);
  return ids;
}

/**
 * Every agent that inherits a team's shared context, mapped to that context —
 * from a NAMED group's `context`, or from `defaultContext` for an agent in no
 * group at all (the virtual default team, which owns every ungrouped agent).
 *
 * A context that is blank (post-`trim`) or absent contributes nothing, so an
 * agent missing from the map simply has no team context — never a `""`
 * placeholder. The sidebar model keeps an agent in at most one group, but this
 * pure function does not lean on that: when an id appears in two groups the
 * last one in array order wins.
 *
 * `agentIds` is the workspace's ROSTER and the default half cannot be computed
 * without it: `ungroupedOrder` is a drag ORDER, not a membership list — an agent
 * nobody has dragged yet appears in neither it nor any group, and the rail still
 * shows it in the default team. Reading membership off the roster is what keeps
 * the file mirror agreeing with what the user sees.
 */
export function resolveContextByAgent(
  layout: SidebarLayout,
  agentIds: Iterable<string>,
): Map<string, string> {
  const byAgent = new Map<string, string>();
  for (const group of layout.groups) {
    const context = group.context?.trim();
    if (!context) continue;
    for (const agentId of group.agentIds) byAgent.set(agentId, context);
  }
  const defaultContext = defaultContextOf(layout);
  if (defaultContext) {
    const grouped = groupedAgentIds(layout);
    for (const agentId of agentIds)
      if (!grouped.has(agentId)) byAgent.set(agentId, defaultContext);
  }
  return byAgent;
}

/**
 * Agent ids whose resolved team context differs between two layouts — added,
 * edited, or removed (a present↔absent flip counts as a change). These are
 * exactly the agents whose `GROUP.md` mirror must be rewritten or deleted. An
 * agent moving between a named team and the default one is a change like any
 * other, so it lands on the right text either way.
 */
export function diffContextByAgent(
  prev: SidebarLayout,
  next: SidebarLayout,
  agentIds: Iterable<string>,
): string[] {
  const roster = [...agentIds];
  const before = resolveContextByAgent(prev, roster);
  const after = resolveContextByAgent(next, roster);
  const changed: string[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(id) !== after.get(id)) changed.push(id);
  }
  return changed;
}

/**
 * Could ANY agent's resolved context differ between these two layouts? A pure,
 * roster-free pre-check, because the common layout write is a plain drag
 * REORDER and it must not cost a listing of every agent in the workspace.
 *
 * Two inputs decide the answer. The named half is the per-agent group-context
 * map, compared directly. The default half only matters when a default context
 * exists at all — and then WHO is grouped decides who inherits it, so a change
 * in that membership set counts even when every group's text is identical.
 */
function contextInputsDiffer(
  prev: SidebarLayout,
  next: SidebarLayout,
): boolean {
  const defaultContext = defaultContextOf(next);
  if (defaultContextOf(prev) !== defaultContext) return true;
  const before = resolveContextByAgent(prev, []);
  const after = resolveContextByAgent(next, []);
  if (before.size !== after.size) return true;
  for (const [id, context] of before)
    if (after.get(id) !== context) return true;
  if (!defaultContext) return false;
  const wasGrouped = groupedAgentIds(prev);
  const isGrouped = groupedAgentIds(next);
  if (wasGrouped.size !== isGrouped.size) return true;
  for (const id of wasGrouped) if (!isGrouped.has(id)) return true;
  return false;
}

/** The dependency slice `syncGroupContextFiles` needs (a subset of AccountDeps). */
interface GroupContextSyncDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  events?: EventHub;
}

/**
 * Mirror each affected agent's team context to its own `GROUP.md` after a
 * sidebar-layout write, so the runtime can fold it into the system prompt. This
 * is a best-effort DERIVED copy: the canonical data is the `sidebar_layout`
 * preference that already persisted, so a missing `vfs`/`paths` dep is a clean
 * no-op that never fails or rolls back the primary write. A stale id that no
 * longer resolves to a real agent is skipped — nothing to write.
 *
 * ONE file for both kinds of team. The runtime reads `GROUP.md` and never asks
 * where it came from (`buildGroupContextSection`), so an agent dragged out of a
 * named team into the default one keeps reading the same path with the other
 * team's text. `WORKSPACE.md` is untouched by any of this.
 */
export async function syncGroupContextFiles(
  deps: GroupContextSyncDeps,
  ws: Workspace,
  prev: SidebarLayout,
  next: SidebarLayout,
): Promise<void> {
  const { vfs, paths } = deps;
  if (!vfs || !paths) return;
  if (!contextInputsDiffer(prev, next)) return;
  const agents = new Map(
    (await deps.store.listAgents(ws.id)).map((a) => [a.id, a]),
  );
  const changed = diffContextByAgent(prev, next, agents.keys());
  if (changed.length === 0) return;
  const resolved = resolveContextByAgent(next, agents.keys());
  for (const agentId of changed) {
    const agent = agents.get(agentId);
    if (!agent) continue;
    const key = `${paths.agentRoot(ws, agent)}/${GROUP_CONTEXT_FILE}`;
    const context = resolved.get(agentId);
    if (context === undefined) await vfs.deleteKey(key);
    else await vfs.writeText(key, context);
    deps.events?.emit(ws.ownerUserId, {
      type: "ContextChanged",
      agentPath: agent.id,
    });
  }
}
