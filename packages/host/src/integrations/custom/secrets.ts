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
import { Effect } from "effect";

/**
 * Secret storage for custom-integration credentials (API keys, MCP tokens).
 *
 * A PORT so each deployment picks its custody: the local/self-host default is
 * a 0600 file on the host's data disk (on managed cloud pods that disk is an
 * encrypted GKE PD); a future cloud adapter can move custody to the gateway's
 * encrypted Postgres or a secret manager WITHOUT touching anything above this
 * interface. Values never enter definitions, events, logs, or the agent
 * runtime — execution resolves them host-side at request-build time.
 */
export interface CustomSecretStore {
  get(id: string): Promise<string | null>;
  set(id: string, value: string): Promise<void>;
  delete(id: string): Promise<void>;
}

/** In-memory store for tests. */
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

/**
 * File-backed store: one JSON object, 0600, atomic tmp+rename. A corrupt file
 * throws (a vanished credential must surface as an error the user can act on,
 * never silently degrade to "not connected").
 */
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
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(map), { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, this.path);
    chmodSync(this.path, 0o600);
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

  /** Migration-only snapshot. Values are copied so callers cannot mutate the store. */
  entries(): Record<string, string> {
    return { ...this.read() };
  }

  /** Remove the legacy file only after every value has reached remote custody. */
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
}

/**
 * Managed-cloud adapter. The host resolves values lazily through its scoped
 * gateway route; the engine pod has no GCP identity or Secret Manager IAM.
 */
export class RemoteCustomSecretStore implements CustomSecretStore {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: RemoteCustomSecretStoreOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get(id: string): Promise<string | null> {
    const response = await this.fetchImpl(this.url(id), {
      headers: this.headers(),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw await this.failure(response, "GET", id);
    const body = (await response.json()) as { value?: unknown };
    if (typeof body.value !== "string") {
      throw new Error(`custom secret gateway returned malformed ${id} body`);
    }
    return body.value;
  }

  async set(id: string, value: string): Promise<void> {
    const response = await this.fetchImpl(this.url(id), {
      method: "PUT",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ value }),
    });
    if (!response.ok) throw await this.failure(response, "PUT", id);
  }

  async delete(id: string): Promise<void> {
    const response = await this.fetchImpl(this.url(id), {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!response.ok) throw await this.failure(response, "DELETE", id);
  }

  /**
   * Read every pre-Secret-Manager value after object-store hydration, upload it,
   * and only then remove the plaintext file. A partial failure leaves the whole
   * file intact for a safe retry on the next boot.
   */
  async migrateLegacy(): Promise<number> {
    const legacy = this.opts.legacy;
    if (!legacy) return 0;
    const entries = Object.entries(legacy.entries());
    for (const [id, value] of entries) await this.set(id, value);
    legacy.clear();
    return entries.length;
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

/** The secret-store id for one integration variable (stable, listable). */
export const secretIdFor = (slug: string, variable: string): string =>
  `ci_${slug}_${variable}`;

/** The executor CredentialProvider key our connections resolve through. */
export const HOUSTON_PROVIDER_KEY = "houston";

/**
 * Adapt the store to the executor's Effect-shaped CredentialProvider so
 * connections reference secrets by id (`from: {provider:"houston", id}`) and
 * the executor resolves values lazily at request time — it never copies them
 * into its own state.
 */
export function houstonCredentialProvider(
  store: CustomSecretStore,
): CredentialProvider {
  return {
    // The key is a branded string on the executor side; ours is a constant.
    key: HOUSTON_PROVIDER_KEY as CredentialProvider["key"],
    writable: true as const,
    get: (id: string) => Effect.promise(() => store.get(id)),
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
