import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { CredentialProvider } from "@executor-js/sdk/core";
import { atomicTempPath } from "@houston/protocol";
import { Effect } from "effect";
import { createCustomSecret, moveLegacyToCustody } from "./legacy-custody";
import { parseBundle, resolveOAuthValue } from "./oauth-bundle";

export interface CustomSecretStore {
  get(id: string): Promise<string | null>;
  set(id: string, value: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export class MemoryCustomSecretStore implements CustomSecretStore {
  private readonly byId = new Map<string, string>();

  async get(id: string): Promise<string | null> {
    return this.byId.get(id) ?? null;
  }

  async set(id: string, value: string): Promise<void> {
    this.byId.set(id, value);
  }

  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

export class FileCustomSecretStore implements CustomSecretStore {
  constructor(private readonly path: string) {}

  private read(): Record<string, string> {
    if (!existsSync(this.path)) return {};
    return JSON.parse(readFileSync(this.path, "utf8")) as Record<
      string,
      string
    >;
  }

  private write(map: Record<string, string>): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = atomicTempPath(this.path);
    writeFileSync(tmp, JSON.stringify(map), { encoding: "utf8", mode: 0o600 });
    if (process.platform === "win32" && existsSync(this.path)) {
      chmodSync(this.path, 0o600);
    }
    renameSync(tmp, this.path);
    if (process.platform !== "win32") {
      chmodSync(this.path, 0o600);
    }
  }

  async get(id: string): Promise<string | null> {
    return this.read()[id] ?? null;
  }

  async set(id: string, value: string): Promise<void> {
    const map = this.read();
    map[id] = value;
    this.write(map);
  }

  async delete(id: string): Promise<void> {
    const map = this.read();
    delete map[id];
    this.write(map);
  }

  entries(): Record<string, string> {
    return { ...this.read() };
  }

  clear(): void {
    if (existsSync(this.path)) rmSync(this.path);
  }
}

export interface RemoteCustomSecretStoreOptions {
  baseUrl: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
  legacy?: FileCustomSecretStore;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
}

export class RemoteCustomSecretStore implements CustomSecretStore {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<
    string,
    { value: string | null; at: number }
  >();

  constructor(private readonly opts: RemoteCustomSecretStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.cacheTtlMs = opts.cacheTtlMs ?? 60_000;
  }

  async get(id: string): Promise<string | null> {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) {
      return cached.value;
    }
    const response = await this.fetchImpl(this.url(id), {
      headers: this.headers(),
    });
    if (response.status === 404) {
      this.cache.set(id, { value: null, at: Date.now() });
      return null;
    }
    if (!response.ok) throw await this.failure(response, "GET", id);
    const body = (await response.json()) as { value?: unknown };
    if (typeof body.value !== "string") {
      throw new Error(`custom secret gateway returned malformed ${id} body`);
    }
    this.cache.set(id, { value: body.value, at: Date.now() });
    return body.value;
  }

  async set(id: string, value: string): Promise<void> {
    const response = await this.fetchImpl(this.url(id), {
      method: "PUT",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ value }),
    });
    if (!response.ok) throw await this.failure(response, "PUT", id);
    this.cache.set(id, { value, at: Date.now() });
  }

  async delete(id: string): Promise<void> {
    const response = await this.fetchImpl(this.url(id), {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!response.ok) throw await this.failure(response, "DELETE", id);
    this.cache.set(id, { value: null, at: Date.now() });
  }

  async migrateLegacy(): Promise<number> {
    const legacy = this.opts.legacy;
    if (!legacy) return 0;
    const result = await moveLegacyToCustody(legacy.entries(), {
      get: (id) => {
        this.cache.delete(id);
        return this.get(id);
      },
      create: (id, value) =>
        createCustomSecret(
          this.fetchImpl,
          this.url(id),
          this.opts.podToken,
          id,
          value,
        ),
    });
    for (const id of Object.keys(legacy.entries())) this.cache.delete(id);
    if (result.complete) legacy.clear();
    return result.moved;
  }

  private url(id: string): string {
    return `${this.baseUrl}/v1/pod/custom-secrets/${encodeURIComponent(this.opts.orgSlug)}/${encodeURIComponent(this.opts.agentSlug)}/${encodeURIComponent(id)}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.opts.podToken}`, ...extra };
  }

  private async failure(response: Response, method: string, id: string) {
    const detail = await response.text().catch(() => "");
    return new Error(
      `custom secret gateway ${method} ${id} failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
}

export const secretIdFor = (slug: string, variable: string): string =>
  `ci_${slug}_${variable}`;

export const HOUSTON_PROVIDER_KEY = "houston";

export async function resolveCredentialValue(
  store: CustomSecretStore,
  id: string,
): Promise<string | null> {
  const raw = await store.get(id);
  if (raw === null) return null;
  const bundle = parseBundle(raw);
  return bundle ? resolveOAuthValue(store, id, raw, bundle) : raw;
}

export function houstonCredentialProvider(
  store: CustomSecretStore,
): CredentialProvider {
  const resolve = (id: string) => resolveCredentialValue(store, id);
  return {
    key: HOUSTON_PROVIDER_KEY as CredentialProvider["key"],
    writable: true as const,
    get: (id: string) => Effect.promise(() => resolve(id)),
    has: (id: string) =>
      Effect.promise(async () => (await store.get(id)) !== null),
    set: (id: string, value: string) =>
      Effect.promise(() => store.set(id, value)),
    delete: (id: string) =>
      Effect.promise(async () => {
        await store.delete(id);
        return true;
      }),
    list: () => Effect.sync(() => []),
  };
}
