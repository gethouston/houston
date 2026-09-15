import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * Per-agent access and model policy — who an agent is assigned to, which
 * toolkits and models it may use, and whether its triggers are live
 * (`cp/agent-teams.ts`). The org-wide roster and its usage reads are
 * {@link OrgsMixin}; the team directory itself is {@link OrgTeamsMixin}.
 */
export function TeamsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Teams extends Base {
    // ---- per-agent assignments (multiplayer) ----
    async setAgentAssignments(
      agentSlugOrId: string,
      assignments: controlPlane.AgentAssignment[] | string[],
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.setAgentAssignments(
        this.ctx.cp,
        agentSlugOrId,
        assignments,
      );
    }
    async getAgentSettings(
      agentSlugOrId: string,
    ): Promise<controlPlane.AgentSettings> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.getAgentSettings(this.ctx.cp, agentSlugOrId);
    }
    async setAgentSettings(
      agentSlugOrId: string,
      settings: {
        allowedToolkits?: string[] | null;
        allowedModels?: string[] | null;
      },
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.setAgentSettings(
        this.ctx.cp,
        agentSlugOrId,
        settings,
      );
    }
    async getAgentModelChoice(
      agentSlugOrId: string,
    ): Promise<controlPlane.AgentModelChoiceInfo | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.getAgentModelChoice(this.ctx.cp, agentSlugOrId);
    }
    async setAgentModelChoice(
      agentSlugOrId: string,
      choice: controlPlane.AgentModelChoice,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.setAgentModelChoice(
        this.ctx.cp,
        agentSlugOrId,
        choice,
      );
    }
    // Trigger status degrades to `null` (triggers unsupported here): no gateway
    // (desktop) or a host that 404s the route → the UI hides the badge rather than
    // erroring. A gateway that serves triggers answers 200.
    async agentTriggerStatus(
      agentId: string,
    ): Promise<controlPlane.TriggerStatusItem[] | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.agentTriggerStatus(this.ctx.cp, agentId);
    }
  }
  return Teams;
}
