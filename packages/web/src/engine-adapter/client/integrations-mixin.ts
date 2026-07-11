import { EngineError } from "@houston/runtime-client";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

export function IntegrationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Integrations extends Base {
    // ---- integrations (Composio, platform mode) — host only ----
    async integrationStatus(): Promise<
      controlPlane.IntegrationProviderStatus[]
    > {
      if (!this.ctx.cp) return [];
      return controlPlane.integrationStatus(this.ctx.cp);
    }
    async setIntegrationSession(token: string | null): Promise<void> {
      if (!this.ctx.cp) return;
      // SDK delegates the byte-identical PUT /v1/integrations/session. The SDK
      // PROPAGATES a 404; web must keep swallowing it — a deployment with no
      // gateway session sink (the cloud host verifies JWTs itself, self-host /
      // direct-key) answers 404, which is a legitimate shape, not a failure.
      // Anything else (network, 5xx) rethrows and the caller surfaces it.
      try {
        await this.ctx.sdk.integrations.setSession(token);
      } catch (err) {
        if (err instanceof EngineError && err.status === 404) return;
        throw err;
      }
    }
    async integrationToolkits(
      provider: string,
    ): Promise<controlPlane.IntegrationToolkit[]> {
      if (!this.ctx.cp) return [];
      return controlPlane.integrationToolkits(this.ctx.cp, provider);
    }
    async integrationConnections(
      provider: string,
    ): Promise<controlPlane.IntegrationConnection[]> {
      if (!this.ctx.cp) return [];
      return controlPlane.integrationConnections(this.ctx.cp, provider);
    }
    async connectIntegration(
      provider: string,
      toolkit: string,
      agent?: string,
    ): Promise<{ redirectUrl: string; connectionId: string }> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      // SDK delegates the byte-identical POST /v1/integrations/:provider/connect
      // with the `{ toolkit, agent? }` body.
      return this.ctx.sdk.integrations.connect(provider, toolkit, agent);
    }
    async integrationConnection(
      provider: string,
      connectionId: string,
    ): Promise<controlPlane.IntegrationConnection> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.integrationConnection(
        this.ctx.cp,
        provider,
        connectionId,
      );
    }
    async disconnectIntegration(
      provider: string,
      toolkit: string,
    ): Promise<void> {
      if (!this.ctx.cp) return;
      // SDK delegates the byte-identical POST
      // /v1/integrations/:provider/disconnect with the `{ toolkit }` body, no
      // refetch (web owns its reads).
      await this.ctx.sdk.integrations.writes.disconnect(toolkit, { provider });
    }
    async dismissIntegrationsReconnectNotice(): Promise<void> {
      // The notice only ever renders from a host-reported `reconnect` flag, so
      // dismissing without a host is a real failure — surface it, don't no-op.
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      // SDK delegates the byte-identical POST
      // /v1/integrations/reconnect-notice/dismiss.
      await this.ctx.sdk.integrations.dismissReconnectNotice();
    }

    // ---- custom integrations (HOU-550) — host only ----
    // A host without the custom-integrations surface answers 404 on the read,
    // which `customIntegrations` maps to null so the section stays hidden. The
    // writes require a host and surface any failure.
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
  }
  return Integrations;
}
