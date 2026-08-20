import { FAMILIES, type HoustonFamily } from "@houston/domain";
import {
  capturePodFence,
  type PodGatewayConfig,
  podGatewayHeaders,
  podGatewayUrl,
} from "../pod-gateway";
import type { ViewFamily } from "./view-capture";
import {
  canonicalJSON,
  etagRevision,
  parseDocBody,
  responseError,
  responseRevision,
} from "./wire";

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
  private disabled = false;

  constructor(
    private readonly opts: {
      gateway: PodGatewayConfig;
      fetchImpl?: typeof fetch;
    },
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async seed(): Promise<void> {
    await Promise.all(FAMILIES.map((family) => this.seedFamily(family)));
  }

  async put(family: ShadowFamily, doc: unknown): Promise<void> {
    if (this.disabled) return;
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
    const response = await this.putAtRevision(family, doc, cachedRevision);
    if (response.status === 409) {
      const revision = await responseRevision(response);
      if (revision === undefined) {
        this.revisions.delete(family);
        this.remote.delete(family);
        console.debug(
          `[doc-shadow] ${family} revision conflict without current revision; re-seeding on next write`,
        );
        return;
      }
      this.revisions.set(family, revision);
      this.remote.delete(family);
      const retry = await this.putAtRevision(family, doc, revision);
      await this.acceptPutResponse(family, retry, canonical);
      return;
    }
    await this.acceptPutResponse(family, response, canonical);
  }

  private async putAtRevision(
    family: ShadowFamily,
    doc: unknown,
    revision: number,
  ): Promise<Response> {
    const response = await this.fetchImpl(this.url(family), {
      method: "PUT",
      headers: podGatewayHeaders(this.opts.gateway, {
        write: true,
        json: true,
        extra: { "If-Match": String(revision) },
      }),
      body: JSON.stringify({ doc }),
      signal: AbortSignal.timeout(5_000),
    });
    capturePodFence(this.opts.gateway, response);
    return response;
  }

  private async acceptPutResponse(
    family: ShadowFamily,
    response: Response,
    canonical: string,
  ): Promise<void> {
    if (response.status === 404) return this.disableForSkew();
    if (response.status === 409) {
      const revision = await responseRevision(response);
      if (revision === undefined) this.revisions.delete(family);
      else this.revisions.set(family, revision);
      this.remote.delete(family);
      console.debug(
        `[doc-shadow] ${family} revision conflict; file remains authoritative`,
      );
      return;
    }
    if (!response.ok) throw await responseError(response, family, "PUT");
    const revision = await responseRevision(response);
    if (revision !== undefined) this.revisions.set(family, revision);
    this.remote.set(family, canonical);
  }

  private async seedFamily(family: ShadowFamily): Promise<boolean> {
    if (this.disabled) return false;
    try {
      const response = await this.fetchImpl(this.url(family), {
        headers: podGatewayHeaders(this.opts.gateway),
        signal: AbortSignal.timeout(5_000),
      });
      capturePodFence(this.opts.gateway, response);
      if (response.status === 404) {
        this.revisions.set(family, 0);
        this.remote.delete(family);
        return true;
      }
      if (!response.ok) throw await responseError(response, family, "GET");
      const text = await response.text();
      const parsed = parseDocBody(text);
      const etag = etagRevision(response);
      this.revisions.set(family, etag ?? parsed.revision ?? 0);
      if (parsed.doc !== undefined) {
        this.remote.set(family, canonicalJSON(parsed.doc));
      } else {
        this.remote.delete(family);
      }
      return true;
    } catch (error) {
      console.error(`[doc-shadow] ${family} revision seed failed`, error);
      this.revisions.delete(family);
      this.remote.delete(family);
      return false;
    }
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
}
