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
    const response = await this.fetchImpl(this.url(family), {
      method: "PUT",
      headers: podGatewayHeaders(this.opts.gateway, {
        write: true,
        json: true,
        extra: { "If-Match": String(this.revisions.get(family) ?? 0) },
      }),
      body: JSON.stringify({ doc }),
      signal: AbortSignal.timeout(5_000),
    });
    capturePodFence(this.opts.gateway, response);
    if (response.status === 404) return this.disableForSkew();
    if (response.status === 409) {
      console.debug(
        `[doc-shadow] ${family} revision conflict; file remains authoritative`,
      );
      return;
    }
    if (!response.ok) throw await responseError(response, family, "PUT");
    const revision = await responseRevision(response);
    if (revision !== undefined) this.revisions.set(family, revision);
  }

  private async seedFamily(family: HoustonFamily): Promise<void> {
    if (this.disabled) return;
    try {
      const response = await this.fetchImpl(this.url(family), {
        headers: podGatewayHeaders(this.opts.gateway),
        signal: AbortSignal.timeout(5_000),
      });
      capturePodFence(this.opts.gateway, response);
      if (response.status === 404) {
        this.revisions.set(family, 0);
        return;
      }
      if (!response.ok) throw await responseError(response, family, "GET");
      const revision = await responseRevision(response);
      this.revisions.set(family, revision ?? 0);
    } catch (error) {
      console.debug(`[doc-shadow] ${family} revision seed failed`, error);
      this.revisions.set(family, 0);
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
