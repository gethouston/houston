import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

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
    async orgAudit(
      opts: { before?: number; limit?: number } = {},
    ): Promise<controlPlane.AuditEntry[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.orgAudit(this.ctx.cp, opts);
    }
    async orgUsage(days: number): Promise<controlPlane.UsageRow[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.orgUsage(this.ctx.cp, days);
    }
    // Tripwire only: the UI gates the compute section (and its query) on
    // `capabilities.computeUsage`, which no gateway-less deployment advertises.
    async computeUsage(days: number): Promise<controlPlane.ComputeUsage> {
      if (!this.ctx.cp)
        throw new Error("compute usage requires the hosted gateway");
      return controlPlane.computeUsage(this.ctx.cp, days);
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
