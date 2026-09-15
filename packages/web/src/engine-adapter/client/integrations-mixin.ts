import type { IntegrationProviderId } from "@houston/protocol";
import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import { deploymentServes } from "./host-capabilities";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** A gateway integrations route, spelled as the SDK's client builds it —
 *  `viaSdk` keys its translation on the path the call actually issues. */
const integrationPath = (...segments: string[]) =>
  `/v1/integrations/${segments.map(encodeURIComponent).join("/")}`;

export function IntegrationsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Integrations extends Base {
    // ---- integrations (Composio, platform mode) — host only ----
    async integrationStatus(): Promise<
      controlPlane.IntegrationProviderStatus[]
    > {
      if (!this.ctx.cp) return [];
      // SDK delegates the byte-identical GET /v1/integrations, unwrapping the
      // `{items}` envelope exactly as the control-plane copy did.
      return viaSdk("/v1/integrations", () =>
        this.ctx.sdk.integrations.reads.status(),
      );
    }
    async setIntegrationSession(token: string | null): Promise<void> {
      if (!this.ctx.cp) return;
      // The hosted gateway advertises `integrationSessionSink: false` — it
      // verifies JWTs itself — so the push is skipped; the 404 swallow below
      // stays for deployments that predate the flag (PRODUCT-1474).
      if (!(await deploymentServes(this.ctx, "integrationSessionSink"))) return;
      // SDK delegates the byte-identical PUT /v1/integrations/session. The SDK
      // PROPAGATES a 404; web must keep swallowing it — a deployment with no
      // gateway session sink (the cloud host verifies JWTs itself, self-host /
      // direct-key) answers 404, which is a legitimate shape, not a failure.
      // Anything else (network, 5xx) rethrows and the caller surfaces it.
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
      provider: string,
      toolkit: string,
      agent?: string,
    ): Promise<{ redirectUrl: string; connectionId: string }> {
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      // SDK delegates the byte-identical POST /v1/integrations/:provider/connect
      // with the `{ toolkit, agent? }` body.
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
      provider: string,
      toolkit: string,
      connectionId?: string,
    ): Promise<void> {
      if (!this.ctx.cp) return;
      // SDK delegates the byte-identical POST
      // /v1/integrations/:provider/disconnect with the `{ toolkit,
      // connectionId? }` body, no refetch (web owns its reads). `connectionId`
      // narrows the removal to ONE account of the toolkit.
      await viaSdk(integrationPath(provider, "disconnect"), () =>
        this.ctx.sdk.integrations.writes.disconnect(toolkit, {
          provider,
          ...(connectionId ? { connectionId } : {}),
        }),
      );
    }
    async dismissIntegrationsReconnectNotice(): Promise<void> {
      // The notice only ever renders from a host-reported `reconnect` flag, so
      // dismissing without a host is a real failure — surface it, don't no-op.
      if (!this.ctx.cp)
        throw new Error("Integrations require a connected host");
      // SDK delegates the byte-identical POST
      // /v1/integrations/reconnect-notice/dismiss.
      await viaSdk(integrationPath("reconnect-notice", "dismiss"), () =>
        this.ctx.sdk.integrations.dismissReconnectNotice(),
      );
    }

    // ---- triggers (C9 event-driven routines) — hosted gateway only ----
    async triggerTypes(toolkit: string): Promise<controlPlane.TriggerType[]> {
      if (!this.ctx.cp) return [];
      return viaSdk("/v1/integrations/composio/trigger-types", () =>
        this.ctx.sdk.integrations.reads.triggerTypes(toolkit),
      );
    }

    // ---- custom integrations ----
    // The whole custom family (top-level + per-agent forms, HOU-550/HOU-823/
    // HOU-980) lives in its own cluster: `custom-integrations-mixin.ts`.
  }
  return Integrations;
}
