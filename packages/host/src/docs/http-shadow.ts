import { FAMILIES, type HoustonFamily } from "@houston/domain";
import {
  capturePodFence,
  type PodGatewayConfig,
  podGatewayHeaders,
  podGatewayUrl,
} from "../pod-gateway";

export interface DocShadow {
  seed(): Promise<void>;
  put(family: HoustonFamily, doc: unknown): Promise<void>;
}

export class HttpDocShadow implements DocShadow {
  private readonly fetchImpl: typeof fetch;
  private readonly revisions = new Map<HoustonFamily, number>();
  // Canonical (key-sorted) JSON of the last doc known to be durable, seeded
  // from the GET and refreshed on every accepted PUT. What makes the boot
  // content seed idempotent: an unchanged file costs one GET, never a PUT,
  // so revisions do not churn on every pod boot.
  private readonly remote = new Map<HoustonFamily, string>();
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

  async put(family: HoustonFamily, doc: unknown): Promise<void> {
    if (this.disabled) return;
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
    family: HoustonFamily,
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
    family: HoustonFamily,
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

  private async seedFamily(family: HoustonFamily): Promise<boolean> {
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
      console.debug(`[doc-shadow] ${family} revision seed failed`, error);
      this.revisions.delete(family);
      this.remote.delete(family);
      return false;
    }
  }

  private url(family: HoustonFamily): string {
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

/** Stable stringify (recursive key sort) so jsonb's key reordering never
 *  reads as a content change. */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function etagRevision(response: Response): number | undefined {
  const etag = response.headers
    .get("ETag")
    ?.replace(/^W\//, "")
    .replaceAll('"', "");
  return etag && Number.isSafeInteger(Number(etag)) ? Number(etag) : undefined;
}

function parseDocBody(text: string): { revision?: number; doc?: unknown } {
  if (!text) return {};
  try {
    const body = JSON.parse(text) as { revision?: unknown; doc?: unknown };
    return {
      ...(typeof body.revision === "number" ? { revision: body.revision } : {}),
      ...("doc" in body ? { doc: body.doc } : {}),
    };
  } catch (error) {
    console.debug("[doc-shadow] response carried no revision", error);
    return {};
  }
}

async function responseRevision(
  response: Response,
): Promise<number | undefined> {
  const etag = response.headers
    .get("ETag")
    ?.replace(/^W\//, "")
    .replaceAll('"', "");
  if (etag && Number.isSafeInteger(Number(etag))) return Number(etag);
  const text = await response.text();
  if (!text) return undefined;
  try {
    const body = JSON.parse(text) as { revision?: unknown };
    return typeof body.revision === "number" ? body.revision : undefined;
  } catch (error) {
    console.debug("[doc-shadow] response carried no revision", error);
    return undefined;
  }
}

async function responseError(
  response: Response,
  family: HoustonFamily,
  method: string,
): Promise<Error> {
  const detail = await response.text();
  return new Error(
    `doc shadow ${method} ${family} failed (${response.status}): ${detail.slice(0, 300)}`,
  );
}
