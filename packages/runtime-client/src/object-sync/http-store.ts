import { objectStoreResponseError } from "./http-store-errors";
import type { HttpObjectStoreOptions } from "./http-store-options";
import { downloadHttpObject, readHttpManifest } from "./http-store-read";
import { uploadHttpObject } from "./http-store-write";
import type { ObjectMetadata } from "./object-manifest";
import type {
  ObjectStore,
  ReadOptions,
  ReadResult,
  WriteOptions,
  WriteResult,
} from "./object-store";
import { type FetchRetryOptions, fetchWithRetry } from "./retry";

export type { HttpObjectStoreOptions } from "./http-store-options";
export { STREAM_UPLOAD_THRESHOLD_BYTES } from "./http-store-upload";

export class HttpObjectStore implements ObjectStore {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly agentSlug: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelaysMs: number[] | undefined;
  private readonly bootId: string | undefined;
  private readonly fence: { token?: string } | undefined;
  private readonly claim:
    | { token: string; bootId: string; conversationId: string }
    | undefined;

  constructor(opts: HttpObjectStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.agentSlug = opts.agentSlug;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retryDelaysMs = opts.retryDelaysMs;
    this.bootId = opts.bootId;
    this.fence = opts.fence;
    this.claim = opts.claim;
    if (Boolean(this.bootId) !== Boolean(this.fence)) {
      throw new Error(
        "object store bootId and fence must be configured together",
      );
    }
    if (this.claim && (this.bootId || this.fence)) {
      throw new Error(
        "object store claim authority cannot be combined with lease authority",
      );
    }
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.manifest(prefix)).map((object) => object.key);
  }

  async manifest(prefix = ""): Promise<ObjectMetadata[]> {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    return readHttpManifest(
      () =>
        this.fetch(`${this.baseUrl}/manifest${query}`, {
          headers: this.authHeaders(),
        }),
      (response) => this.captureFence(response),
      prefix,
    );
  }

  async download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<void> {
    await this.downloadVersioned(key, destFile, opts);
  }

  /** Download one object and preserve the generation from its GET response. */
  async downloadVersioned(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    return downloadHttpObject(
      () =>
        this.fetch(this.objectUrl(key), {
          headers: this.authHeaders(),
          signal: opts?.signal,
        }),
      (response) => this.captureFence(response),
      key,
      destFile,
      opts?.signal,
    );
  }

  async upload(
    srcFile: string,
    key: string,
    opts?: WriteOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: ObjectStore preserves void-returning adapters.
  ): Promise<WriteResult | void> {
    const url = this.objectUrl(key);
    const headers = this.writeHeaders(opts);
    // Fenced unconditional writes are idempotent and retry-safe: a superseded
    // writer is rejected by its token. Generation-guarded writes cannot retry
    // because a lost success is indistinguishable from a failed attempt.
    const retryable = !this.guardedWrite(opts);
    return uploadHttpObject({
      fetchRequest: this.fetch.bind(this),
      url,
      srcFile,
      key,
      headers,
      retryable,
      capture: (response) => this.captureFence(response),
    });
  }

  async delete(key: string, opts?: WriteOptions): Promise<void> {
    // As with PUT, a generation-guarded DELETE may have committed despite a
    // lost response.
    const res = await this.fetch(
      this.objectUrl(key),
      {
        method: "DELETE",
        headers: this.writeHeaders(opts),
      },
      { retryable: !this.guardedWrite(opts) },
    );
    this.captureFence(res);
    if (!res.ok && res.status !== 404) {
      throw await objectStoreResponseError(res, "DELETE", key);
    }
  }

  /**
   * GETs and fenced-but-unconditional writes are safe to re-issue. Writes with
   * generation preconditions disable retries because a lost success cannot be
   * distinguished from a failed attempt without violating the precondition.
   */
  private fetch(
    url: string,
    init?: RequestInit,
    extra?: Pick<FetchRetryOptions, "body" | "retryable">,
  ): Promise<Response> {
    return fetchWithRetry(this.fetchImpl, url, init, {
      delaysMs: this.retryDelaysMs,
      ...extra,
    });
  }

  private objectUrl(key: string): string {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/objects/${encoded}`;
  }

  private authHeaders(): Record<string, string> {
    return this.agentSlug
      ? {
          Authorization: `Bearer ${this.token}`,
          "X-Houston-Agent": this.agentSlug,
        }
      : { Authorization: `Bearer ${this.token}` };
  }

  private writeHeaders(opts?: WriteOptions): Record<string, string> {
    const headers = this.authHeaders();
    if (opts?.ifGenerationMatch !== undefined) {
      headers["X-Houston-If-Generation-Match"] = opts.ifGenerationMatch;
    }
    if (this.fence?.token !== undefined && this.bootId !== undefined) {
      headers["X-Houston-Fencing-Token"] = this.fence.token;
      headers["X-Houston-Boot-Id"] = this.bootId;
    } else if (this.claim) {
      headers["X-Houston-Claim-Token"] = this.claim.token;
      headers["X-Houston-Claim-Boot"] = this.claim.bootId;
      headers["X-Houston-Claim-Conversation"] = this.claim.conversationId;
    }
    return headers;
  }

  private guardedWrite(opts?: WriteOptions): boolean {
    return opts?.ifGenerationMatch !== undefined;
  }

  private captureFence(res: Response): void {
    if (!res.ok) return;
    const token = res.headers.get("X-Houston-Fencing-Token");
    if (token !== null && this.fence) this.fence.token = token;
  }
}
