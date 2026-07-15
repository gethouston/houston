import * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";

export function TeamsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Teams extends Base {
    // ---- per-agent assignments + integration grants (multiplayer) ----
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
    async getOrgSettings(): Promise<controlPlane.OrgSettings> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.getOrgSettings(this.ctx.cp);
    }
    async setOrgSettings(settings: {
      allowedToolkits?: string[] | null;
      allowedModels?: string[] | null;
    }): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.setOrgSettings(this.ctx.cp, settings);
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

    // Grants degrade gracefully: `null` means "this deployment has no grants
    // model" (the legacy engine path, or a host that 404s the route), which the UI
    // treats as unsupported rather than a hard failure. A host that serves grants
    // (the local/self-host TS host, or the cloud gateway) answers with the set.
    async agentIntegrationGrants(
      agentSlugOrId: string,
    ): Promise<string[] | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.agentIntegrationGrants(this.ctx.cp, agentSlugOrId);
    }
    // Trigger status degrades to `null` (triggers unsupported here) the same way
    // grants do: no gateway (desktop) or a host that 404s the route → the UI hides
    // the badge rather than erroring. A gateway that serves triggers answers 200.
    async agentTriggerStatus(
      agentId: string,
    ): Promise<controlPlane.TriggerStatusItem[] | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.agentTriggerStatus(this.ctx.cp, agentId);
    }
    async setAgentIntegrationGrants(
      agentSlugOrId: string,
      toolkits: string[],
    ): Promise<void> {
      // Grants are cloud-only: off-cloud there is no per-agent grants model, so
      // this stays a no-op (never a network call) — the guard is preserved.
      if (!this.ctx.cp) return;
      // Delegate the WRITE to the SDK (migration wave 2a): its IntegrationsClient
      // issues the identical `PUT /v1/agents/:id/integration-grants` with body
      // `{toolkits}` over the SAME shared gateway fetch (bearer + `x-houston-org`)
      // and does NOT read the response or refetch — byte-identical to the old
      // `controlPlane.setAgentIntegrationGrants`. The READ (`agentIntegrationGrants`
      // above) stays on cpFetch: its GET carries `transientRetryFetch`, which the
      // SDK path lacks, so delegating it would drop that retry resilience.
      await this.ctx.sdk.integrations.setGrants(agentSlugOrId, toolkits);
    }

    // ---- per-agent action approvals ----
    // Unlike grants, these are HOST routes that work in BOTH deployments, on
    // the per-agent DISPATCH surface (`/agents/:id/action-approvals[...]`):
    // the local/self-host host serves it directly, and the cloud gateway
    // proxies exactly this surface to the agent's pod (it mounts NO
    // `/v1/agents/*` route for approvals — calling the `/v1` form 404s at the
    // gateway and breaks the in-chat approval card). So they route through
    // `authFetch` against `baseUrl` (bearer + `x-houston-org`, live in both)
    // — never cp-gated, or the local approval card would break.
    async agentActionApprovals(
      agentSlugOrId: string,
    ): Promise<{ always: string[] }> {
      const res = await this.ctx.authFetch(
        `${this.ctx.baseUrl}/agents/${encodeURIComponent(agentSlugOrId)}/action-approvals`,
      );
      // A host that does not serve the gate answers 404 → nothing pre-approved.
      // The card only shows where the gate exists, so degrade rather than throw
      // (mirrors the shim's `agentActionApprovals`).
      if (res.status === 404) return { always: [] };
      if (!res.ok)
        throw new HoustonEngineError(
          res.status,
          await res.json().catch(() => ({})),
        );
      return (await res.json()) as { always: string[] };
    }
    async allowActionAlways(
      agentSlugOrId: string,
      action: string,
    ): Promise<{ always: string[] }> {
      const res = await this.ctx.authFetch(
        `${this.ctx.baseUrl}/agents/${encodeURIComponent(agentSlugOrId)}/action-approvals/always`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok)
        throw new HoustonEngineError(
          res.status,
          await res.json().catch(() => ({})),
        );
      return (await res.json()) as { always: string[] };
    }
    async addActionApprovalTicket(
      agentSlugOrId: string,
      hash: string,
    ): Promise<void> {
      const res = await this.ctx.authFetch(
        `${this.ctx.baseUrl}/agents/${encodeURIComponent(agentSlugOrId)}/action-approvals/tickets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash }),
        },
      );
      if (!res.ok)
        throw new HoustonEngineError(
          res.status,
          await res.json().catch(() => ({})),
        );
    }
  }
  return Teams;
}
