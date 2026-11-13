import { captureFencingToken } from "./fencing-token";
import { downloadHttpBatch } from "./http-store-batch";
import { objectStoreResponseError } from "./http-store-errors";
import {
  assertWriteAuthority,
  type HttpObjectStoreOptions,
} from "./http-store-options";
import {
  downloadHttpObject,
  manifestUrl,
  readHttpDirManifest,
  readHttpManifest,
} from "./http-store-read";
import { HttpUploadStore } from "./http-store-uploads";
import { uploadHttpObject } from "./http-store-write";
import { storeWriteHeaders } from "./http-store-write-headers";
import type { DirListing, ObjectMetadata } from "./object-manifest";
import type {
  ObjectStore,
  ReadOptions,
  ReadResult,
  WriteOptions,
  WriteResult,
} from "./object-store";
import { type FetchRetryOptions, fetchWithRetry } from "./retry";
import type { UploadStore } from "./upload-store";

export type { HttpObjectStoreOptions } from "./http-store-options";
export { STREAM_UPLOAD_THRESHOLD_BYTES } from "./http-store-upload";

export class HttpObjectStore implements ObjectStore {
  private readonly opts: HttpObjectStoreOptions;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  /** Present only with `batchReads`: hydration batches iff the store has it. */
  readonly downloadMany?: ObjectStore["downloadMany"];

  readonly copyUpload: UploadStore["copyUpload"];
  readonly readUpload: UploadStore["readUpload"];

  constructor(opts: HttpObjectStoreOptions) {
    this.opts = { ...opts };
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (opts.batchReads) {
      const post = (init: RequestInit) =>
        this.fetch(`${this.baseUrl}/batch`, init);
      this.downloadMany = (entries, readOpts) =>
        downloadHttpBatch(post, this.authHeaders(), entries, readOpts);
    }
    assertWriteAuthority(opts);
    const uploads = new HttpUploadStore({
      baseUrl: this.baseUrl,
      request: this.fetch.bind(this),
      authHeaders: () => this.authHeaders(),
      writeHeaders: () => this.writeHeaders(),
      capture: (res) => this.captureFence(res),
    });
    this.copyUpload = uploads.copyUpload.bind(uploads);
    this.readUpload = uploads.readUpload.bind(uploads);
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.manifest(prefix)).map((object) => object.key);
  }

  async manifest(prefix = "", opts?: ReadOptions): Promise<ObjectMetadata[]> {
    return readHttpManifest(
      this.manifestRequest(prefix, false),
      (response) => this.captureFence(response),
      prefix,
      opts?.signal,
    );
  }

  async manifestDir(
    prefix = "",
    opts?: ReadOptions,
  ): Promise<DirListing | undefined> {
    return readHttpDirManifest(
      this.manifestRequest(prefix, true),
      (response) => this.captureFence(response),
      opts?.signal,
    );
  }

  async download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    return this.downloadVersioned(key, destFile, opts);
  }

  /** Download one object and preserve the generation from its GET response. */
  async downloadVersioned(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    return downloadHttpObject(
      (signal, condition) =>
        this.fetch(this.objectUrl(key), {
          headers: { ...this.authHeaders(), ...condition },
          signal,
        }),
      (response) => this.captureFence(response),
      key,
      destFile,
      opts,
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
    const retryable = opts?.ifGenerationMatch === undefined;
    return uploadHttpObject({
      fetchRequest: this.fetch.bind(this),
      url,
      srcFile,
      key,
      headers,
      retryable,
      capture: (response) => this.captureFence(response),
      ...(opts?.signal ? { signal: opts.signal } : {}),
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
      { retryable: opts?.ifGenerationMatch === undefined },
    );
    this.captureFence(res);
    if (!res.ok && res.status !== 404) {
      throw await objectStoreResponseError(res, "DELETE", key);
    }
  }

  private fetch(
    url: string,
    init?: RequestInit,
    extra?: Pick<FetchRetryOptions, "body" | "retryable">,
  ): Promise<Response> {
    return fetchWithRetry(this.fetchImpl, url, init, {
      delaysMs: this.opts.retryDelaysMs,
      ...extra,
    });
  }

  private manifestRequest(prefix: string, oneLevel: boolean) {
    const url = manifestUrl(this.baseUrl, prefix, oneLevel);
    return (signal?: AbortSignal) =>
      this.fetch(url, { headers: this.authHeaders(), signal });
  }

  private objectUrl(key: string): string {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/objects/${encoded}`;
  }

  private authHeaders(): Record<string, string> {
    const auth = { Authorization: `Bearer ${this.opts.token}` };
    return this.opts.agentSlug
      ? { ...auth, "X-Houston-Agent": this.opts.agentSlug }
      : auth;
  }

  private writeHeaders(opts?: WriteOptions): Record<string, string> {
    const { bootId, fence, claim } = this.opts;
    return storeWriteHeaders(this.authHeaders(), opts, {
      bootId,
      fence,
      claim,
    });
  }

  private captureFence(res: Response): void {
    if (!res.ok || !this.opts.fence) return;
    captureFencingToken(
      this.opts.fence,
      res.headers.get("X-Houston-Fencing-Token"),
    );
  }
}
