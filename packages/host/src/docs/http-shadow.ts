import { FAMILIES, type HoustonFamily } from "@houston/domain";
import {
  type PodGatewayConfig,
  podGatewayHeaders,
  podGatewayUrl,
} from "../pod-gateway";
import type { DocPublisher, ShadowPutResult } from "./doc-publisher";
import { ShadowUnavailableError, shadowFetch } from "./shadow-fetch";
import { publishDoc } from "./shadow-put";
import { seedFromResponse } from "./shadow-seed";
import type { ViewFamily } from "./view-capture";
import { canonicalJSON } from "./wire";

export { canonicalJSON } from "./wire";

/** The role an agent's job description names, derived from its `CLAUDE.md`
 *  (`agent-role/`): the gateway lists every agent's role from these documents
 *  instead of reading each job description through its pod. */
export const AGENT_ROLE_FAMILY = "agent_role";

/** Everything the shadow can hold: family files, engine-computed views, and
 *  the agent's role. */
export type ShadowFamily =
  | HoustonFamily
  | ViewFamily
  | typeof AGENT_ROLE_FAMILY;

export interface DocShadow {
  seed(): Promise<void>;
  put(family: ShadowFamily, doc: unknown): Promise<void>;
}

export class HttpDocShadow implements DocShadow, DocPublisher {
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

  /** Fire-and-forget projection: a deferred doc is re-sent by the next
   *  capture or warm tick. */
  async put(family: ShadowFamily, doc: unknown): Promise<void> {
    await this.publish(family, doc);
  }

  async publish(family: ShadowFamily, doc: unknown): Promise<ShadowPutResult> {
    if (this.latched(family)) return "unsupported";
    if (doc === undefined) {
      // canonicalJSON(undefined) is not a string; comparing it against a
      // missing cache entry would silently skip the write. No caller may
      // pass undefined — surface the contract violation instead.
      throw new Error(`[doc-shadow] ${family} put called without a document`);
    }
    const seeded =
      this.revisions.has(family) || (await this.seedFamily(family));
    if (this.latched(family)) return "unsupported";
    if (!seeded) return "deferred";
    const canonical = canonicalJSON(doc);
    if (this.remote.get(family) === canonical) return "landed";
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
      if (this.latched(family)) return "unsupported";
      // A conflict yields to the file without storing this doc.
      return this.remote.get(family) === canonical ? "landed" : "deferred";
    } catch (error) {
      if (!(error instanceof ShadowUnavailableError)) throw error;
      // Self-healing: the cached revision survives and the next capture or
      // warm tick re-publishes. A warning breadcrumb, never a Sentry error.
      console.warn(`[doc-shadow] ${family} PUT deferred: ${error.message}`);
      return "deferred";
    }
  }

  private latched(family: ShadowFamily): boolean {
    return this.disabled || this.unsupported.has(family);
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
