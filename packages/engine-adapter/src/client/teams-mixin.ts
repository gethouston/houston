import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Per-agent access and model policy — who an agent is assigned to, which
 * toolkits and models it may use, and whether its triggers are live. The
 * gateway's `/v1/agents/:id/{assignments,settings,model-choice,trigger-status}`
 * family, delegated to `sdk.teams` (`packages/sdk/src/modules/teams`). The
 * org-wide roster and its usage reads are {@link OrgsMixin}.
 *
 * The SDK never softens a failure, so the two degradations this family has live
 * here: a gateway that serves no model choices and one that serves no triggers
 * both answer 404, and both read as "this deployment is single-player" rather
 * than an error.
 */
export function TeamsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Teams extends Base {
    // ---- per-agent assignments (multiplayer) ----
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
    // Model choice degrades to `null` (choices unsupported here): no gateway
    // (desktop) or a host that 404s the route → the composer falls back to
    // single-player behavior. Every other error still surfaces.
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
    // Trigger status degrades to `null` (triggers unsupported here): no gateway
    // (desktop) or a host that 404s the route → the UI hides the badge rather than
    // erroring. A gateway that serves triggers answers 200.
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
