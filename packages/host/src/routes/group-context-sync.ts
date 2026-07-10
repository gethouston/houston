import type { SidebarLayout } from "@houston/protocol";
import type { Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

/** The per-agent mirror file each group member's shared context is written to. */
const GROUP_CONTEXT_FILE = "GROUP.md";

/**
 * Every agent that inherits a group's shared context, mapped to that context.
 * A group whose `context` is blank (post-`trim`) or absent contributes nothing,
 * so an agent missing from the map simply has no group context — never a `""`
 * placeholder. The sidebar model keeps an agent in at most one group, but this
 * pure function does not lean on that: when an id appears in two groups the
 * last one in array order wins.
 */
export function resolveGroupContextByAgent(
  layout: SidebarLayout,
): Map<string, string> {
  const byAgent = new Map<string, string>();
  for (const group of layout.groups) {
    const context = group.context?.trim();
    if (!context) continue;
    for (const agentId of group.agentIds) byAgent.set(agentId, context);
  }
  return byAgent;
}

/**
 * Agent ids whose resolved group context differs between two layouts — added,
 * edited, or removed (a present↔absent flip counts as a change). These are
 * exactly the agents whose `GROUP.md` mirror must be rewritten or deleted.
 */
export function diffGroupContext(
  prev: SidebarLayout,
  next: SidebarLayout,
): string[] {
  const before = resolveGroupContextByAgent(prev);
  const after = resolveGroupContextByAgent(next);
  const changed: string[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(id) !== after.get(id)) changed.push(id);
  }
  return changed;
}

/** The dependency slice `syncGroupContextFiles` needs (a subset of AccountDeps). */
interface GroupContextSyncDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  events?: EventHub;
}

/**
 * Mirror each affected agent's group context to its own `GROUP.md` after a
 * sidebar-layout write, so the runtime can fold it into the system prompt. This
 * is a best-effort DERIVED copy: the canonical data is the `sidebar_layout`
 * preference that already persisted, so a missing `vfs`/`paths` dep is a clean
 * no-op that never fails or rolls back the primary write. A stale id that no
 * longer resolves to a real agent is skipped — nothing to write.
 */
export async function syncGroupContextFiles(
  deps: GroupContextSyncDeps,
  ws: Workspace,
  prev: SidebarLayout,
  next: SidebarLayout,
): Promise<void> {
  const { vfs, paths } = deps;
  if (!vfs || !paths) return;
  const changed = diffGroupContext(prev, next);
  if (changed.length === 0) return;
  const resolved = resolveGroupContextByAgent(next);
  const agents = new Map(
    (await deps.store.listAgents(ws.id)).map((a) => [a.id, a]),
  );
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
