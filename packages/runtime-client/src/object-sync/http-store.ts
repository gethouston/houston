import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { objectStoreResponseError } from "./http-store-errors";
import { uploadFile } from "./http-store-upload";
import { type ObjectMetadata, parseObjectManifest } from "./object-manifest";
import type { ObjectStore, WriteOptions, WriteResult } from "./object-store";
import { type FetchRetryOptions, fetchWithRetry } from "./retry";

export { STREAM_UPLOAD_THRESHOLD_BYTES } from "./http-store-upload";

export interface HttpObjectStoreOptions {
  /** Full agent-scoped base URL ending in `/v1/pod/store/<org>/<agent>`. */
  baseUrl: string;
  token: string;
  /** Shared routes additionally bind the pod token to its own agent slug. */
  agentSlug?: string;
  fetchImpl?: typeof fetch;
  /** One delay per retry of a transient failure; override to speed up tests. */
  retryDelaysMs?: number[];
  /** Stable for this engine boot and sent only after a fencing token is seen. */
  bootId?: string;
  /** Mutable lease token shared by every agent-prefix request in this boot. */
  fence?: { token?: string };
}

export class HttpObjectStore implements ObjectStore {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly agentSlug: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelaysMs: number[] | undefined;
  private readonly bootId: string | undefined;
  private readonly fence: { token?: string } | undefined;

  constructor(opts: HttpObjectStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.agentSlug = opts.agentSlug;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retryDelaysMs = opts.retryDelaysMs;
    this.bootId = opts.bootId;
    this.fence = opts.fence;
    if (Boolean(this.bootId) !== Boolean(this.fence)) {
      throw new Error(
        "object store bootId and fence must be configured together",
      );
    }
  }

  async list(prefix: string): Promise<string[]> {
    return (await this.manifest(prefix)).map((object) => object.key);
  }

  async manifest(prefix = ""): Promise<ObjectMetadata[]> {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    const res = await this.fetch(`${this.baseUrl}/manifest${query}`, {
      headers: this.authHeaders(),
    });
    this.captureFence(res);
    if (!res.ok) throw await objectStoreResponseError(res, "GET", "manifest");
    return parseObjectManifest(
      await res.json(),
      "object store GET manifest",
    ).filter((object) => !prefix || object.key.startsWith(prefix));
  }

  async download(key: string, destFile: string): Promise<void> {
    const res = await this.fetch(this.objectUrl(key), {
      headers: this.authHeaders(),
    });
    this.captureFence(res);
    if (!res.ok) throw await objectStoreResponseError(res, "GET", key);
    if (!res.body) {
      throw new Error(`object store GET ${key} returned no response body`);
    }

    await mkdir(dirname(destFile), { recursive: true });
    const tempFile = `${destFile}.${randomUUID()}.tmp`;
    try {
      await pipeline(
        Readable.fromWeb(res.body as NodeReadableStream),
        createWriteStream(tempFile),
      );
      await rename(tempFile, destFile);
    } catch (err) {
      await rm(tempFile, { force: true });
      throw err;
    }
  }

  async upload(
    srcFile: string,
    key: string,
    opts?: WriteOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: ObjectStore preserves void-returning adapters.
  ): Promise<WriteResult | void> {
    const url = this.objectUrl(key);
    const headers = this.writeHeaders(opts);
    // A guarded write is not safe to replay after a lost response: the first
    // attempt may have committed, making the retry fail its own generation.
    const retryable = !this.guardedWrite(opts);
    const res = await uploadFile(
      this.fetch.bind(this),
      url,
      srcFile,
      headers,
      retryable,
    );
    this.captureFence(res);
    if (!res.ok) throw await objectStoreResponseError(res, "PUT", key);
    const body: unknown = await res.json();
    const metadata = parseObjectManifest(
      { objects: [body] },
      `object store PUT ${key}`,
    )[0];
    if (!metadata) {
      throw new Error(`object store PUT ${key} returned a malformed body`);
    }
    const generation =
      metadata.generation ??
      res.headers.get("X-Houston-Generation") ??
      undefined;
    return generation === undefined ? undefined : { generation };
  }

  async delete(key: string, opts?: WriteOptions): Promise<void> {
    // As with PUT, a guarded DELETE may have committed despite a lost response.
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
   * GETs and unguarded writes are safe to re-issue. Guarded writes explicitly
   * disable retries at their call sites because a lost success cannot be
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
    }
    return headers;
  }

  private guardedWrite(opts?: WriteOptions): boolean {
    return (
      opts?.ifGenerationMatch !== undefined || this.fence?.token !== undefined
    );
  }

  private captureFence(res: Response): void {
    const token = res.headers.get("X-Houston-Fencing-Token");
    if (token !== null && this.fence) this.fence.token = token;
  }
}
