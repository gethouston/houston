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
import type { AgentState } from "./agents/state";
import { invalidateAgentLoads, startAgentSideEffects } from "./agents-loading";

type SetState = StoreApi<AgentState>["setState"];
type GetState = StoreApi<AgentState>["getState"];

export function agentWriteActions(
  set: SetState,
  get: GetState,
): Pick<AgentState, "delete" | "rename" | "updateColor" | "paint"> {
  const repaint = () =>
    set((s) => {
      const agents = overlayHeldAgentWrites(s.agents);
      const current = s.current
        ? (agents.find((a) => a.id === s.current?.id) ?? s.current)
        : null;
      return { agents, current };
    });

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
      const forgetDrafts = prepareAgentDraftForget(id, before.agents);
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
          const back = wasCurrent
            ? selectionAfterRefusedDelete(get().current, switchedTo, row)
            : null;
          if (back) get().setCurrent(find(back.id) ?? back);
        }
        throw err;
      } finally {
        release();
      }
      useAgentProvisioningStore.getState().clearProvisioning(id);
      forgetDrafts();
    },

    rename: async (workspaceId, id, newName) => {
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
      useAgentProvisioningStore.getState().carryRename(id, updated);
      carryAgentPaints(id, updated.id);
      land(id, updated);
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
