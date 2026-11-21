import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function TeamsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Teams extends Base {
    async setAgentAssignments(
      agentSlugOrId: string,
      assignments: controlPlane.AgentAssignment[],
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/assignments`,
        () =>
          this.ctx.sdk.teams.setAgentAssignments(agentSlugOrId, assignments),
      );
    }
    async getAgentSettings(
      agentSlugOrId: string,
    ): Promise<controlPlane.AgentSettings> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
        () => this.ctx.sdk.teams.getAgentSettings(agentSlugOrId),
      );
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
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
        () => this.ctx.sdk.teams.setAgentSettings(agentSlugOrId, settings),
      );
    }
    async getAgentModelChoice(
      agentSlugOrId: string,
    ): Promise<controlPlane.AgentModelChoiceInfo | null> {
      if (!this.ctx.cp) return null;
      try {
        return await viaSdk(
          `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
          () => this.ctx.sdk.teams.getAgentModelChoice(agentSlugOrId),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404)
          return null;
        throw err;
      }
    }
    async setAgentModelChoice(
      agentSlugOrId: string,
      choice: controlPlane.AgentModelChoice,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
        () => this.ctx.sdk.teams.setAgentModelChoice(agentSlugOrId, choice),
      );
    }
    async agentTriggerStatus(
      agentId: string,
    ): Promise<controlPlane.TriggerStatusItem[] | null> {
      if (!this.ctx.cp) return null;
      try {
        return await viaSdk(
          `/v1/agents/${encodeURIComponent(agentId)}/trigger-status`,
          () => this.ctx.sdk.teams.agentTriggerStatus(agentId),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404)
          return null;
        throw err;
      }
    }
  }
  return Teams;
}
