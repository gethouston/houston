import type { StoreApi } from "zustand";
import {
  type AgentPaint,
  restoreAgentRow,
  selectionAfterRefusedDelete,
} from "../lib/agent-roster-overlay";
import { tauriAgents } from "../lib/agents-facade";
import { prepareAgentDraftForget } from "../lib/forget-agent-drafts";
import type { Agent } from "../lib/types";
import { useAgentProvisioningStore } from "./agent-provisioning";
import {
  carryAgentPaints,
  holdAgentDelete,
  holdAgentPaint,
  overlayHeldAgentWrites,
} from "./agent-roster-holds";
import { invalidateAgentLoads, startAgentSideEffects } from "./agents-loading";
import type { AgentState } from "./agents/state";

type SetState = StoreApi<AgentState>["setState"];
type GetState = StoreApi<AgentState>["getState"];

/**
 * The roster's user writes, all optimistic: the row changes in the frame the
 * person acts, the host call runs behind it, and a refusal puts the row back
 * and REJECTS, so the caller (`useAgentActions`) tells the person what did not
 * happen. Every resolve replaces the guess with the host's record.
 */
export function agentWriteActions(
  set: SetState,
  get: GetState,
): Pick<AgentState, "delete" | "rename" | "updateColor" | "paint"> {
  /** Re-run the held edits over the store's roster (and its selection). */
  const repaint = () =>
    set((s) => {
      const agents = overlayHeldAgentWrites(s.agents);
      const current = s.current
        ? (agents.find((a) => a.id === s.current?.id) ?? s.current)
        : null;
      return { agents, current };
    });

  /** Put one field of `id` back to what it was before a refused write. */
  const unpaint = (id: string, field: keyof AgentPaint, before?: Agent) => {
    if (!before) return;
    const revert = (a: Agent) =>
      a.id === id ? { ...a, [field]: before[field] } : a;
    set((s) => ({
      agents: s.agents.map(revert),
      current: s.current ? revert(s.current) : null,
    }));
    repaint();
  };

  /** Swap the host's record in for `id`, keeping edits still in flight. */
  const land = (id: string, updated: Agent) => {
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? updated : a)) }));
    repaint();
  };

  const find = (id: string) => get().agents.find((a) => a.id === id);

  return {
    paint: (id, paint) => {
      const before = find(id);
      const release = holdAgentPaint(id, paint);
      repaint();
      return (revert = false) => {
        release();
        if (!revert) return;
        for (const field of Object.keys(paint) as Array<keyof AgentPaint>) {
          unpaint(id, field, before);
        }
      };
    },

    delete: async (workspaceId, id) => {
      const before = get();
      const index = before.agents.findIndex((a) => a.id === id);
      const row = before.agents[index];
      const wasCurrent = before.current?.id === id;
      // `AgentsChanged` lands before the delete answers, so capture the
      // draft keys while the roster still names this agent.
      const forgetDrafts = prepareAgentDraftForget(id, before.agents);
      // A roster read already in flight predates the delete and would land
      // the row again after the hold is released.
      invalidateAgentLoads();
      const release = holdAgentDelete(id);
      const agents = get().agents.filter((a) => a.id !== id);
      const switchedTo = wasCurrent ? (agents[0] ?? null) : null;
      set(wasCurrent ? { agents, current: switchedTo } : { agents });
      if (switchedTo) startAgentSideEffects(switchedTo);
      try {
        await tauriAgents.delete(workspaceId, id);
      } catch (err) {
        if (row) {
          set((s) => ({ agents: restoreAgentRow(s.agents, row, index) }));
          // The delete moved the view (and the stored "last agent") away;
          // a refusal moves it back unless the person has moved on since.
          const back = wasCurrent
            ? selectionAfterRefusedDelete(get().current, switchedTo, row)
            : null;
          if (back) get().setCurrent(find(back.id) ?? back);
        }
        throw err;
      } finally {
        release();
      }
      // A deleted agent is never "being created": stop the probe and the UI.
      // Conversation state lives in the SDK VM and its uploads died with the
      // agent's workspace, so only the drafts are left to forget.
      useAgentProvisioningStore.getState().clearProvisioning(id);
      forgetDrafts();
    },

    rename: async (workspaceId, id, newName) => {
      // The engine renames the folder on disk, so folderPath (and the id)
      // change too: the host's record replaces the row, never just `name`.
      // A roster read started before the rename would reinstate the removed
      // folder path, so it is rejected.
      invalidateAgentLoads();
      const before = find(id);
      const release = holdAgentPaint(id, { name: newName });
      repaint();
      let updated: Agent;
      try {
        updated = await tauriAgents.rename(workspaceId, id, newName);
      } catch (err) {
        release();
        unpaint(id, "name", before);
        throw err;
      }
      release();
      // A warm-up probe pointed at the old path would 404 and wrongly read as
      // "ready" (HOU-693).
      useAgentProvisioningStore.getState().carryRename(id, updated);
      carryAgentPaints(id, updated.id);
      land(id, updated);
      // Re-select the agent being viewed so the stored "last agent" pick
      // names the surviving folder (the old one is gone).
      const landed = find(updated.id);
      if (get().current?.id === id && landed) get().setCurrent(landed);
      return landed ?? updated;
    },

    updateColor: async (workspaceId, id, color) => {
      const before = find(id);
      const release = holdAgentPaint(id, { color });
      repaint();
      try {
        const updated = await tauriAgents.updateColor(workspaceId, id, color);
        release();
        land(id, updated);
      } catch (err) {
        release();
        unpaint(id, "color", before);
        throw err;
      }
    },
  };
}
