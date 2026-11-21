import type { ProviderCatalog } from "@houston/protocol";
import type {
  Capabilities,
  HealthResponse,
  VersionResponse,
} from "@houston/wire-types";
import {
  officePreviewCapabilitiesSchema,
  retryAfterMsOf,
} from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import type { AdapterContext } from "./context";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";

/**
 * What this deployment can do (`GET /v1/capabilities`) - the SERVER describing
 * itself: which profile it runs, whether it has a shell, an org, a skills
 * store, triggers, and which AI providers it offers.
 *
 * Lives here, in a scanned `*-mixin.ts`, because that is the only place the
 * assistant-catalog generator looks. Routed through `cpFetch` on
 * `prefConfig()` (the gateway in cloud, the local host otherwise) rather than
 * `this.engine.capabilities()`: hosted mode rotates the bearer mid-session, so
 * the token is read live per attempt and a 401 refreshes + replays (HOU-687),
 * and a non-2xx arrives as a `HoustonEngineError` carrying the host's reason.
 * It is also the only honest answer to "am I talking to an open host or to the
 * cloud gateway" - a build-time flag cannot tell, since the desktop shell sets
 * `__HOUSTON_CP__` on every delivery path.
 * @assistant group:system
 */
export async function getCapabilities(
  ctx: AdapterContext,
): Promise<Capabilities> {
  const res = await controlPlane.cpFetch(ctx.prefConfig(), "/v1/capabilities");
  const capabilities = (await res.json()) as Capabilities;
  return {
    ...capabilities,
    ...officePreviewCapabilitiesSchema.parse(capabilities),
  };
}

export function BootMixin<TBase extends BaseCtor>(Base: TBase) {
  class Boot extends Base {
    async health(): Promise<HealthResponse> {
      const h = await this.ctx.engine.health();
      return { status: h.status, version: h.version, protocol: 1 };
    }
    async version(): Promise<VersionResponse> {
      const res = await controlPlane.gatewayAuthFetch(
        this.ctx.token,
        () => this.ctx.cp?.activeOrgSlug,
      )(`${this.ctx.baseUrl}/v1/version`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new HoustonEngineError(
          res.status,
          body,
          retryAfterMsOf(res.headers),
        );
      }
      return (await res.json()) as VersionResponse;
    }
    async capabilities(): Promise<Capabilities> {
      return getCapabilities(this.ctx);
    }
    async getCatalog(): Promise<ProviderCatalog> {
      const res = await controlPlane.gatewayAuthFetch(this.ctx.token)(
        `${this.ctx.baseUrl}/v1/catalog`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new HoustonEngineError(
          res.status,
          body,
          retryAfterMsOf(res.headers),
        );
      }
      return (await res.json()) as ProviderCatalog;
    }
  }
  return Boot;
}
