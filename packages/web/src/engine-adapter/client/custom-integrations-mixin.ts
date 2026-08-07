import * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";

/**
 * Custom integrations (HOU-550 / HOU-980): user-added API / MCP servers the
 * Composio catalog does not offer. Two route families, one data set:
 *
 * - the TOP-LEVEL `/v1/integrations/custom/*` form (cp-gated) — the global
 *   Integrations page against a direct host. A host without the feature
 *   answers 404 on the reads, which map to null so the custom UI hides.
 * - the PER-AGENT dispatch `/agents/:id/integrations/custom/*` (HOU-823) —
 *   the ONE form a gateway-fronted deployment proxies to the agent's pod (the
 *   gateway's own /v1/integrations subtree is Composio-only, so the top-level
 *   form 404s there). Routed through `authFetch` against `baseUrl`, never
 *   cp-gated. Any surface that knows its agent calls these.
 */
export function CustomIntegrationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class CustomIntegrations extends Base {
    // ---- top-level form (direct host) ----
    async customIntegrations(): Promise<
      controlPlane.CustomIntegrationView[] | null
    > {
      if (!this.ctx.cp) return null;
      return controlPlane.customIntegrations(this.ctx.cp);
    }
    async removeCustomIntegration(slug: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.removeCustomIntegration(this.ctx.cp, slug);
    }
    async submitCustomIntegrationCredential(
      slug: string,
      values: Record<string, string>,
    ): Promise<controlPlane.CustomIntegrationView> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.submitCustomIntegrationCredential(
        this.ctx.cp,
        slug,
        values,
      );
    }
    async detectCustomIntegration(
      url: string,
    ): Promise<controlPlane.CustomDetectResult> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.detectCustomIntegration(this.ctx.cp, url);
    }
    async startCustomIntegrationOAuth(
      slug: string,
    ): Promise<{ authorizeUrl: string }> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.startCustomIntegrationOAuth(this.ctx.cp, slug);
    }
    async addCustomIntegration(
      input: controlPlane.AddCustomIntegrationInput,
    ): Promise<controlPlane.CustomIntegrationView> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.addCustomIntegration(this.ctx.cp, input);
    }
    async customIntegrationTools(
      slug: string,
    ): Promise<controlPlane.CustomToolInfo[] | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.customIntegrationTools(this.ctx.cp, slug);
    }

    // ---- per-agent dispatch form (works in BOTH deployments, HOU-823) ----
    async agentCustomIntegrations(
      agentSlugOrId: string,
    ): Promise<controlPlane.CustomIntegrationView[] | null> {
      // 404 = the host does not serve the feature → the custom UI hides
      // (mirrors `customIntegrations`' null degrade).
      const res = await this.agentCustomFetch(agentSlugOrId, "/definitions");
      if (res.status === 404) return null;
      await this.rejectFailure(res);
      return (
        (await res.json()) as { items: controlPlane.CustomIntegrationView[] }
      ).items;
    }
    async submitAgentCustomIntegrationCredential(
      agentSlugOrId: string,
      slug: string,
      values: Record<string, string>,
    ): Promise<controlPlane.CustomIntegrationView> {
      const res = await this.agentCustomFetch(
        agentSlugOrId,
        `/definitions/${encodeURIComponent(slug)}/credential`,
        { values },
      );
      await this.rejectFailure(res);
      return (await res.json()) as controlPlane.CustomIntegrationView;
    }
    async detectAgentCustomIntegration(
      agentSlugOrId: string,
      url: string,
    ): Promise<controlPlane.CustomDetectResult> {
      const res = await this.agentCustomFetch(agentSlugOrId, "/detect", {
        url,
      });
      await this.rejectFailure(res);
      return (await res.json()) as controlPlane.CustomDetectResult;
    }
    async startAgentCustomIntegrationOAuth(
      agentSlugOrId: string,
      slug: string,
    ): Promise<{ authorizeUrl: string }> {
      // `{}` forces the POST branch — the start route takes no body.
      const res = await this.agentCustomFetch(
        agentSlugOrId,
        `/definitions/${encodeURIComponent(slug)}/oauth/start`,
        {},
      );
      await this.rejectFailure(res);
      return (await res.json()) as { authorizeUrl: string };
    }
    async addAgentCustomIntegration(
      agentSlugOrId: string,
      input: controlPlane.AddCustomIntegrationInput,
    ): Promise<controlPlane.CustomIntegrationView> {
      const res = await this.agentCustomFetch(
        agentSlugOrId,
        "/definitions",
        input,
      );
      await this.rejectFailure(res);
      return (await res.json()) as controlPlane.CustomIntegrationView;
    }
    async removeAgentCustomIntegration(
      agentSlugOrId: string,
      slug: string,
    ): Promise<void> {
      const res = await this.agentCustomFetch(
        agentSlugOrId,
        `/definitions/${encodeURIComponent(slug)}`,
        undefined,
        "DELETE",
      );
      await this.rejectFailure(res);
    }
    async agentCustomIntegrationTools(
      agentSlugOrId: string,
      slug: string,
    ): Promise<controlPlane.CustomToolInfo[] | null> {
      const res = await this.agentCustomFetch(
        agentSlugOrId,
        `/definitions/${encodeURIComponent(slug)}/tools`,
      );
      if (res.status === 404) {
        // A bare 404 = the route family is absent (feature hidden → null);
        // `{code:"not_found"}` marks an UNKNOWN SLUG — a real miss (the
        // definition was removed concurrently), surfaced as an error.
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
        };
        if (body?.code === "not_found") throw new HoustonEngineError(404, body);
        return null;
      }
      await this.rejectFailure(res);
      return ((await res.json()) as { items: controlPlane.CustomToolInfo[] })
        .items;
    }

    /** One authFetch for the whole per-agent family: GET when no body and no
     *  method override, POST with a JSON body otherwise. */
    private agentCustomFetch(
      agentSlugOrId: string,
      sub: string,
      body?: unknown,
      method?: "DELETE",
    ): Promise<Response> {
      const url = `${this.ctx.baseUrl}/agents/${encodeURIComponent(agentSlugOrId)}/integrations/custom${sub}`;
      if (method) return this.ctx.authFetch(url, { method });
      if (body === undefined) return this.ctx.authFetch(url);
      return this.ctx.authFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    private async rejectFailure(res: Response): Promise<void> {
      if (res.ok) return;
      throw new HoustonEngineError(
        res.status,
        await res.json().catch(() => ({})),
      );
    }
  }
  return CustomIntegrations;
}
