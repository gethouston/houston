import type { ProviderCatalog } from "@houston/protocol";
import type {
  Capabilities,
  HealthResponse,
  VersionResponse,
} from "@houston/wire-types";
import { retryAfterMsOf } from "@houston/wire-types";
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
  return (await res.json()) as Capabilities;
}

export function BootMixin<TBase extends BaseCtor>(Base: TBase) {
  class Boot extends Base {
    // ---- meta / boot ----
    async health(): Promise<HealthResponse> {
      const h = await this.ctx.engine.health();
      return { status: h.status, version: h.version, protocol: 1 };
    }
    async version(): Promise<VersionResponse> {
      // gatewayAuthFetch on `/v1/version` (not `this.engine.version()`): the
      // runtime-protocol client asks `/version`, a path only the pi runtime
      // serves — the host's and the gateway's meta surface is `/v1/version`, so
      // the old call 404'd against every host, silently breaking the
      // migration-reconnect probe (HOU-688). Live-bearer fetch for the same
      // reason as capabilities() (HOU-687).
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
      // Uncached on purpose: `role` is PER-SPACE, so the caller re-fetches after
      // a space switch (C8 §capabilities). The shared implementation is
      // `getCapabilities` above.
      return getCapabilities(this.ctx);
    }
    /**
     * pi-ai's FULL static model catalog — every provider and every runnable model
     * with the picker/settings metadata (`GET /v1/catalog`, wire `ProviderCatalog`).
     *
     * Reached the SAME direct way as `capabilities()` / `version()` (a `/v1/*` GET
     * on `baseUrl`), NOT the control plane:
     * `/v1/catalog` is served by the PUBLIC meta surface of the LOCAL host
     * (desktop) and the per-agent engine pod (cloud) — not the cloud control
     * plane. The catalog is built from pi-ai's baked registry (no egress), so it's
     * identical on desktop and inside an egress-locked pod. Live-bearer fetch so a
     * rotated Supabase token refreshes + replays on 401 (HOU-687), as
     * capabilities() does.
     */
    async getCatalog(): Promise<ProviderCatalog> {
      const res = await controlPlane.gatewayAuthFetch(this.ctx.token)(
        `${this.ctx.baseUrl}/v1/catalog`,
      );
      // No 404 tolerance: `/v1/catalog` is served by every current host AND by the
      // e2e/standalone-web fake host (packages/fake-host serves it via the real
      // `buildProviderCatalog`). A 404 therefore means a genuinely stale host, and
      // silently degrading to `[]` is what shipped the packaged app with providers
      // but zero models. Throw like every other route so the failure surfaces (the
      // caller keeps the seed so the UI still renders — but loudly).
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
