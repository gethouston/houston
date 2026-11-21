import type { IntegrationProviderId } from "@houston/protocol";
import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import { deploymentServes } from "./host-capabilities";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

const integrationPath = (...segments: string[]) =>
  `/v1/integrations/${segments.map(encodeURIComponent).join("/")}`;

export function IntegrationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Integrations extends Base {
    async integrationStatus(): Promise<
      controlPlane.IntegrationProviderStatus[]
    > {
      if (!this.ctx.cp) return [];
      return viaSdk("/v1/integrations", () =>
        this.ctx.sdk.integrations.reads.status(),
      );
    }
    async setIntegrationSession(token: string | null): Promise<void> {
      if (!this.ctx.cp) return;
      if (!(await deploymentServes(this.ctx, "integrationSessionSink"))) return;
      try {
        await viaSdk(integrationPath("session"), () =>
          this.ctx.sdk.integrations.setSession(token),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) return;
        throw err;
      }
    }
    async integrationToolkits(
      provider: IntegrationProviderId,
    ): Promise<controlPlane.IntegrationToolkit[]> {
      if (!this.ctx.cp) return [];
      return viaSdk(integrationPath(provider, "toolkits"), () =>
        this.ctx.sdk.integrations.reads.toolkits(provider),
      );
    }
    async integrationConnections(
      provider: IntegrationProviderId,
    ): Promise<controlPlane.IntegrationConnection[]> {
      if (!this.ctx.cp) return [];
      return viaSdk(integrationPath(provider, "connections"), () =>
        this.ctx.sdk.integrations.reads.connections(provider),
      );
    }
    async connectIntegration(
      provider: IntegrationProviderId,
      toolkit: string,
      agent?: string,
    ): Promise<{ redirectUrl: string; connectionId: string }> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return viaSdk(integrationPath(provider, "connect"), () =>
        this.ctx.sdk.integrations.connect(provider, toolkit, agent),
      );
    }
    async integrationConnection(
      provider: IntegrationProviderId,
      connectionId: string,
    ): Promise<controlPlane.IntegrationConnection> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      return viaSdk(
        integrationPath(provider, "connections", connectionId),
        () =>
          this.ctx.sdk.integrations.reads.connection(provider, connectionId),
      );
    }
    async disconnectIntegration(
      provider: IntegrationProviderId,
      toolkit: string,
      connectionId?: string,
    ): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(integrationPath(provider, "disconnect"), () =>
        this.ctx.sdk.integrations.writes.disconnect(toolkit, {
          provider,
          ...(connectionId ? { connectionId } : {}),
        }),
      );
    }
    async dismissIntegrationsReconnectNotice(): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      await viaSdk(integrationPath("reconnect-notice", "dismiss"), () =>
        this.ctx.sdk.integrations.dismissReconnectNotice(),
      );
    }

    async triggerTypes(toolkit: string): Promise<controlPlane.TriggerType[]> {
      if (!this.ctx.cp) return [];
      return viaSdk("/v1/integrations/composio/trigger-types", () =>
        this.ctx.sdk.integrations.reads.triggerTypes(toolkit),
      );
    }
  }
  return Integrations;
}
