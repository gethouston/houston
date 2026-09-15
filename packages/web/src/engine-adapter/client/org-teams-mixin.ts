import type * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * C13 agent teams — the hosted gateway only, delegated whole to `sdk.teams`
 * (`packages/sdk/src/modules/teams`). Distinct from {@link TeamsMixin}, which
 * carries the per-AGENT multiplayer surface (assignments, settings, model
 * choice) and shares only a name.
 *
 * NOTHING here degrades to `[]`/`null` off-cloud, reads included: the whole
 * surface is gated on `capabilities.agentTeams`, which no gateway-less
 * deployment advertises, so reaching these methods without a control plane is a
 * caller bug and must say so. A silently-empty answer would render "you have no
 * teams" as the truth and blank the rail.
 */
export function OrgTeamsMixin<TBase extends BaseCtor>(Base: TBase) {
  class OrgTeams extends Base {
    async listAgentTeams(): Promise<controlPlane.AgentTeam[]> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk("/v1/org/teams", () => this.ctx.sdk.teams.listAgentTeams());
    }
    async createAgentTeam(input: {
      name: string;
      icon?: string;
      color?: string;
    }): Promise<controlPlane.AgentTeam> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk("/v1/org/teams", () =>
        this.ctx.sdk.teams.createAgentTeam(input),
      );
    }
    async updateAgentTeam(
      teamId: string,
      patch: {
        name?: string;
        sortOrder?: number;
        icon?: string;
        color?: string;
        context?: string;
      },
    ): Promise<controlPlane.AgentTeam> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk(`/v1/org/teams/${encodeURIComponent(teamId)}`, () =>
        this.ctx.sdk.teams.updateAgentTeam(teamId, patch),
      );
    }
    async deleteAgentTeam(teamId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk(`/v1/org/teams/${encodeURIComponent(teamId)}`, () =>
        this.ctx.sdk.teams.deleteAgentTeam(teamId),
      );
    }
    async listAgentTeamMembers(
      teamId: string,
    ): Promise<controlPlane.AgentTeamMember[]> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk(`/v1/org/teams/${encodeURIComponent(teamId)}/members`, () =>
        this.ctx.sdk.teams.listAgentTeamMembers(teamId),
      );
    }
    async removeAgentTeamMember(teamId: string, userId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk(
        `/v1/org/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
        () => this.ctx.sdk.teams.removeAgentTeamMember(teamId, userId),
      );
    }
    async setAgentTeamMemberOwner(
      teamId: string,
      userId: string,
      owner: boolean,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk(
        `/v1/org/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
        () => this.ctx.sdk.teams.setAgentTeamMemberOwner(teamId, userId, owner),
      );
    }
    async setAgentTeam(agentSlugOrId: string, teamId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/team`,
        () => this.ctx.sdk.teams.setAgentTeam(agentSlugOrId, teamId),
      );
    }
  }
  return OrgTeams;
}
