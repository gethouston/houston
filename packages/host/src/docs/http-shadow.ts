import { FAMILIES, type HoustonFamily } from "@houston/domain";
import {
  type PodGatewayConfig,
  podGatewayHeaders,
  podGatewayUrl,
} from "../pod-gateway";
import { ShadowUnavailableError, shadowFetch } from "./shadow-fetch";
import { publishDoc } from "./shadow-put";
import { seedFromResponse } from "./shadow-seed";
import type { ViewFamily } from "./view-capture";
import { canonicalJSON } from "./wire";

export { canonicalJSON } from "./wire";

/** Everything the shadow can hold: family files plus engine-computed views. */
export type ShadowFamily = HoustonFamily | ViewFamily;

export interface DocShadow {
  seed(): Promise<void>;
  put(family: ShadowFamily, doc: unknown): Promise<void>;
}

export class HttpDocShadow implements DocShadow {
  private readonly fetchImpl: typeof fetch;
  private readonly revisions = new Map<ShadowFamily, number>();
  // Canonical (key-sorted) JSON of the last doc known to be durable, seeded
  // from the GET and refreshed on every accepted PUT. What makes the boot
  // content seed idempotent: an unchanged file costs one GET, never a PUT,
  // so revisions do not churn on every pod boot.
  private readonly remote = new Map<ShadowFamily, string>();
  // Families a skewed gateway rejected as unknown (engine ahead of its
  // allow-list). Per-family, unlike the process-wide route skew latch: one
  // new view family must not kill projection for the families it does know.
  private readonly unsupported = new Set<ShadowFamily>();
  private readonly retryDelaysMs: number[];
  private disabled = false;

  constructor(
    private readonly opts: {
      gateway: PodGatewayConfig;
      fetchImpl?: typeof fetch;
      retryDelaysMs?: number[];
    },
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retryDelaysMs = opts.retryDelaysMs ?? [500, 2_000];
  }

  async seed(): Promise<void> {
    await Promise.all(FAMILIES.map((family) => this.seedFamily(family)));
  }

  async put(family: ShadowFamily, doc: unknown): Promise<void> {
    if (this.disabled || this.unsupported.has(family)) return;
    if (doc === undefined) {
      // canonicalJSON(undefined) is not a string; comparing it against a
      // missing cache entry would silently skip the write. No caller may
      // pass undefined — surface the contract violation instead.
      throw new Error(`[doc-shadow] ${family} put called without a document`);
    }
    if (!this.revisions.has(family)) {
      const seeded = await this.seedFamily(family);
      if (!seeded || this.disabled) return;
    }
    const canonical = canonicalJSON(doc);
    if (this.remote.get(family) === canonical) return;
    const cachedRevision = this.revisions.get(family);
    if (cachedRevision === undefined) {
      throw new Error(`[doc-shadow] ${family} revision unavailable after seed`);
    }
    try {
      const outcome = await publishDoc({
        family,
        doc,
        canonical,
        revision: cachedRevision,
        putAtRevision: (revision) => this.putAtRevision(family, doc, revision),
        caches: { revisions: this.revisions, remote: this.remote },
      });
      if (outcome.skew) this.disableForSkew();
      if (outcome.unsupported !== undefined) {
        this.markUnsupported(family, outcome.unsupported);
      }
    } catch (error) {
      if (!(error instanceof ShadowUnavailableError)) throw error;
      // Self-healing: the cached revision survives and the next capture or
      // warm tick re-publishes. A warning breadcrumb, never a Sentry error.
      console.warn(`[doc-shadow] ${family} PUT deferred: ${error.message}`);
    }
  }

  private async putAtRevision(
    family: ShadowFamily,
    doc: unknown,
    revision: number,
  ): Promise<Response> {
    return shadowFetch({
      fetchImpl: this.fetchImpl,
      gateway: this.opts.gateway,
      url: this.url(family),
      retryDelaysMs: this.retryDelaysMs,
      init: () => ({
        method: "PUT",
        headers: podGatewayHeaders(this.opts.gateway, {
          write: true,
          json: true,
          extra: { "If-Match": String(revision) },
        }),
        body: JSON.stringify({ doc }),
        signal: AbortSignal.timeout(5_000),
      }),
    });
  }

  private async seedFamily(family: ShadowFamily): Promise<boolean> {
    if (this.disabled || this.unsupported.has(family)) return false;
    const outcome = await seedFromResponse(family, () => this.getDoc(family), {
      revisions: this.revisions,
      remote: this.remote,
    });
    if (outcome.unsupported !== undefined) {
      this.markUnsupported(family, outcome.unsupported);
    }
    return outcome.seeded;
  }

  private getDoc(family: ShadowFamily): Promise<Response> {
    return shadowFetch({
      fetchImpl: this.fetchImpl,
      gateway: this.opts.gateway,
      url: this.url(family),
      retryDelaysMs: this.retryDelaysMs,
      init: () => ({
        headers: podGatewayHeaders(this.opts.gateway),
        signal: AbortSignal.timeout(5_000),
      }),
    });
  }

  private url(family: ShadowFamily): string {
    const { gateway } = this.opts;
    return podGatewayUrl(
      gateway,
      `/v1/pod/docs/${encodeURIComponent(gateway.orgSlug)}/${encodeURIComponent(gateway.agentSlug)}/${family}`,
    );
  }

  private disableForSkew(): void {
    if (this.disabled) return;
    this.disabled = true;
    console.debug(
      "[doc-shadow] gateway route unavailable; disabling for this process",
    );
  }

  private markUnsupported(family: ShadowFamily, detail: string): void {
    if (this.unsupported.has(family)) return;
    this.unsupported.add(family);
    console.warn(
      `[doc-shadow] gateway does not know family ${family} (deploy skew); skipping it until restart: ${detail}`,
    );
  }
}
