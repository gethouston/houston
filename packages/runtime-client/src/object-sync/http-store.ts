import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { ObjectStore } from "./object-store";
import { fetchWithRetry } from "./retry";

export interface HttpObjectStoreOptions {
  /** Full agent-scoped base URL ending in `/v1/pod/store/<org>/<agent>`. */
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** One delay per retry of a transient failure; override to speed up tests. */
  retryDelaysMs?: number[];
}

interface ObjectMetadata {
  key: string;
  size: number;
  md5: string;
  updated: string;
}

/**
 * Agent-scoped remote object adapter for managed engine pods. The gateway owns
 * tenancy and authorization; this adapter preserves agent-relative keys and
 * makes downloads atomic so a failed hydration cannot leave a partial cache.
 */
export class HttpObjectStore implements ObjectStore {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelaysMs: number[] | undefined;

  constructor(opts: HttpObjectStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.retryDelaysMs = opts.retryDelaysMs;
  }

  async list(prefix: string): Promise<string[]> {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    const res = await this.fetch(`${this.baseUrl}/manifest${query}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw await this.responseError(res, "GET", "manifest");
    const body: unknown = await res.json();
    if (!this.isManifest(body)) {
      throw new Error("object store GET manifest returned a malformed body");
    }
    return body.objects
      .map((object) => object.key)
      .filter((key) => !prefix || key.startsWith(prefix));
  }

  async download(key: string, destFile: string): Promise<void> {
    const res = await this.fetch(this.objectUrl(key), {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw await this.responseError(res, "GET", key);
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

  async upload(srcFile: string, key: string): Promise<void> {
    const res = await this.fetch(this.objectUrl(key), {
      method: "PUT",
      headers: this.authHeaders(),
      body: await readFile(srcFile),
    });
    if (!res.ok) throw await this.responseError(res, "PUT", key);
    const body: unknown = await res.json();
    if (!this.isObjectMetadata(body)) {
      throw new Error(`object store PUT ${key} returned a malformed body`);
    }
  }

  async delete(key: string): Promise<void> {
    const res = await this.fetch(this.objectUrl(key), {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      throw await this.responseError(res, "DELETE", key);
    }
  }

  /**
   * All four operations are safe to re-issue: GETs are read-only and PUT /
   * DELETE of a single object are idempotent, so transient gateway failures
   * retry here instead of failing readiness-gating hydration or sync-back.
   */
  private fetch(url: string, init?: RequestInit): Promise<Response> {
    return fetchWithRetry(this.fetchImpl, url, init, {
      delaysMs: this.retryDelaysMs,
    });
  }

  private objectUrl(key: string): string {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/objects/${encoded}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private isManifest(value: unknown): value is { objects: ObjectMetadata[] } {
    if (!value || typeof value !== "object" || !("objects" in value)) {
      return false;
    }
    const { objects } = value as { objects: unknown };
    return (
      Array.isArray(objects) &&
      objects.every((item) => this.isObjectMetadata(item))
    );
  }

  private isObjectMetadata(value: unknown): value is ObjectMetadata {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<ObjectMetadata>;
    return (
      typeof item.key === "string" &&
      typeof item.size === "number" &&
      typeof item.md5 === "string" &&
      typeof item.updated === "string"
    );
  }

  private async responseError(
    res: Response,
    method: string,
    key: string,
  ): Promise<Error> {
    const body = await res.text();
    return new Error(
      `object store ${method} ${key} failed (${res.status})${
        body ? `: ${body.slice(0, 200)}` : ""
      }`,
    );
  }
}
