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
      return controlPlane.setIntegrationSession(this.ctx.cp, token);
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
      return controlPlane.connectIntegration(
        this.ctx.cp,
        provider,
        toolkit,
        agent,
      );
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
      return controlPlane.disconnectIntegration(this.ctx.cp, provider, toolkit);
    }
    async dismissIntegrationsReconnectNotice(): Promise<void> {
      // The notice only ever renders from a host-reported `reconnect` flag, so
      // dismissing without a host is a real failure — surface it, don't no-op.
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return controlPlane.dismissIntegrationsReconnectNotice(this.ctx.cp);
    }
  }
  return Integrations;
}
