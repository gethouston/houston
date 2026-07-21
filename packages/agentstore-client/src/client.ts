/**
 * The single HTTP client for the Houston gateway's Agent Store REST API,
 * mounted under `/v1/agentstore`. It replaces the hand-rolled `fetch` code in
 * `agentstore/src/lib/store-*.ts`, `ui/engine-client/src/store-catalog.ts`, and
 * `packages/web/src/engine-adapter/portable-store.ts`.
 *
 * The client is isomorphic: it reads no environment and touches no `window`,
 * `document`, or Node built-in. Consumer-specific concerns (which gateway origin
 * to hit, Next.js `next.revalidate` caching, forwarded XFF headers) are injected
 * per call — `baseUrl` at construction, and `StoreRequestOptions.init`/`headers`
 * on every method.
 */
import { StoreApiError } from "./errors.ts";
import type {
  AdminQueueItem,
  AdminReport,
  AgentPatch,
  AvatarUploadResult,
  ClaimInput,
  ClaimResult,
  CreateAgentRequest,
  CreateAgentResponse,
  CreatorAnalytics,
  CreatorProfile,
  CreatorProfilePatch,
  CreatorReport,
  HandleAvailability,
  MyAgent,
  PatchAgentResponse,
  PurgeResult,
  ReportInput,
  ReportStatus,
  StoreAgentDetail,
  StoreCatalogPage,
  StoreCatalogQuery,
  StoreCatalogSort,
  StoreCategory,
  StoreCreatorPage,
  StoreInstallTarget,
} from "./types.ts";

/** The Agent Store API path prefix on the gateway. */
export const STORE_API_PREFIX = "/v1/agentstore";

/** Construction options for {@link AgentStoreClient}. */
export interface StoreClientOptions {
  /** The gateway origin (e.g. `https://gateway.gethouston.ai`); path prefix is added. */
  baseUrl: string;
  /** Fetch implementation to use; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Supplies the bearer token for authenticated calls. Returning `null` (or the
   * option being absent) makes every authed method throw a 401-shaped
   * {@link StoreApiError} before any request is sent.
   */
  getToken?: () => string | null | Promise<string | null>;
}

/**
 * Per-call request options, the trailing optional argument on every method.
 * `init` is shallow-merged into the underlying `fetch` call (letting Next.js
 * callers pass `{ next: { revalidate } }` and server callers forward XFF via a
 * `signal`/`cache`), while `headers` is a convenience map merged on top of the
 * client-computed headers; `init.headers`, when present, wins over both.
 */
export interface StoreRequestOptions {
  init?: RequestInit;
  headers?: Record<string, string>;
}

/** Internal shape describing one outgoing request. */
interface SendSpec {
  query?: URLSearchParams;
  body?: unknown;
  auth?: boolean;
  options?: StoreRequestOptions;
}

export class AgentStoreClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getToken?: () => string | null | Promise<string | null>;

  constructor(options: StoreClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.getToken = options.getToken;
  }

  // ── Anonymous ─────────────────────────────────────────────────────────────

  /** One page of published, public agents for the browsable catalog. */
  listAgents(
    query: StoreCatalogQuery = {},
    options?: StoreRequestOptions,
  ): Promise<StoreCatalogPage> {
    return this.requestJson<StoreCatalogPage>("GET", "/agents", {
      query: catalogQuery(query),
      options,
    });
  }

  /** A published agent by slug, with its full IR snapshot. */
  getAgent(
    slug: string,
    options?: StoreRequestOptions,
  ): Promise<StoreAgentDetail> {
    return this.requestJson<StoreAgentDetail>(
      "GET",
      `/agents/${encodeURIComponent(slug)}`,
      { options },
    );
  }

  /** The controlled category vocabulary for the filter chips. */
  async listCategories(
    options?: StoreRequestOptions,
  ): Promise<StoreCategory[]> {
    const body = await this.requestJson<{ items: StoreCategory[] }>(
      "GET",
      "/categories",
      { options },
    );
    return body.items;
  }

  /** Record an anonymous install of a published agent. */
  async recordInstall(
    slug: string,
    target: StoreInstallTarget,
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send("POST", `/agents/${encodeURIComponent(slug)}/installs`, {
      body: { target },
      options,
    });
  }

  /** File an anonymous abuse report against a published agent. */
  async reportAgent(
    slug: string,
    input: ReportInput,
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send("POST", `/agents/${encodeURIComponent(slug)}/reports`, {
      body: input,
      options,
    });
  }

  /** A creator's public page: their profile plus one page of public agents. */
  getCreator(
    handle: string,
    query: { page?: number; sort?: StoreCatalogSort } = {},
    options?: StoreRequestOptions,
  ): Promise<StoreCreatorPage> {
    const params = new URLSearchParams();
    if (query.sort) params.set("sort", query.sort);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    return this.requestJson<StoreCreatorPage>(
      "GET",
      `/creators/${encodeURIComponent(handle)}`,
      { query: params, options },
    );
  }

  /** File an anonymous abuse report against a creator. */
  async reportCreator(
    handle: string,
    input: ReportInput,
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send("POST", `/creators/${encodeURIComponent(handle)}/reports`, {
      body: input,
      options,
    });
  }

  // ── Authenticated ─────────────────────────────────────────────────────────

  /** The caller's agents in every lifecycle state (`GET /me/agents`). */
  async listMyAgents(options?: StoreRequestOptions): Promise<MyAgent[]> {
    const body = await this.requestJson<{ items: MyAgent[] }>(
      "GET",
      "/me/agents",
      {
        auth: true,
        options,
      },
    );
    return body.items;
  }

  /** Create (and optionally publish) an owned agent (`POST /agents`). */
  createAgent(
    body: CreateAgentRequest,
    options?: StoreRequestOptions,
  ): Promise<CreateAgentResponse> {
    return this.requestJson<CreateAgentResponse>("POST", "/agents", {
      auth: true,
      body,
      options,
    });
  }

  /** Apply one edit intent to an owned agent (`PATCH /agents/{id}`). */
  patchAgent(
    id: string,
    patch: AgentPatch,
    options?: StoreRequestOptions,
  ): Promise<PatchAgentResponse> {
    return this.requestJson<PatchAgentResponse>(
      "PATCH",
      `/agents/${encodeURIComponent(id)}`,
      { auth: true, body: patch, options },
    );
  }

  /** Soft-delete an owned agent (`DELETE /agents/{id}`). */
  async deleteAgent(id: string, options?: StoreRequestOptions): Promise<void> {
    await this.send("DELETE", `/agents/${encodeURIComponent(id)}`, {
      auth: true,
      options,
    });
  }

  /** Claim an unclaimed agent with the code from the claim link (`POST /claim`). */
  claimAgent(
    input: ClaimInput,
    options?: StoreRequestOptions,
  ): Promise<ClaimResult> {
    return this.requestJson<ClaimResult>("POST", "/claim", {
      auth: true,
      body: input,
      options,
    });
  }

  /**
   * The caller's own creator profile, or `null` when they have never
   * materialized one (unwraps the `{ profile }` envelope).
   */
  async getMyProfile(
    options?: StoreRequestOptions,
  ): Promise<CreatorProfile | null> {
    const body = await this.requestJson<{ profile: CreatorProfile | null }>(
      "GET",
      "/me/profile",
      { auth: true, options },
    );
    return body.profile;
  }

  /** Upsert the caller's creator profile (`PATCH /me/profile`). */
  async patchMyProfile(
    patch: CreatorProfilePatch,
    options?: StoreRequestOptions,
  ): Promise<CreatorProfile> {
    const body = await this.requestJson<{ profile: CreatorProfile }>(
      "PATCH",
      "/me/profile",
      { auth: true, body: patch, options },
    );
    return body.profile;
  }

  /** Whether a handle is claimable by the caller (`GET /handles/{handle}/available`). */
  checkHandle(
    handle: string,
    options?: StoreRequestOptions,
  ): Promise<HandleAvailability> {
    return this.requestJson<HandleAvailability>(
      "GET",
      `/handles/${encodeURIComponent(handle)}/available`,
      { auth: true, options },
    );
  }

  /**
   * Replace the caller's avatar with `blob` (`POST /me/avatar`, multipart field
   * `file`). The boundary is set by `fetch` from the `FormData` body — the
   * client never sets `Content-Type` itself.
   */
  uploadAvatar(
    blob: Blob,
    options?: StoreRequestOptions,
  ): Promise<AvatarUploadResult> {
    const form = new FormData();
    form.append("file", blob);
    return this.requestJson<AvatarUploadResult>("POST", "/me/avatar", {
      auth: true,
      body: form,
      options,
    });
  }

  /** Clear the caller's avatar (`DELETE /me/avatar`). Idempotent. */
  async deleteAvatar(options?: StoreRequestOptions): Promise<void> {
    await this.send("DELETE", "/me/avatar", { auth: true, options });
  }

  /**
   * Per-UTC-day install analytics over the caller's owned agents
   * (`GET /me/analytics?days=`). `days` is clamped server-side to [1, 90]; an
   * omitted value defaults to 90.
   */
  getMyAnalytics(
    days?: number,
    options?: StoreRequestOptions,
  ): Promise<CreatorAnalytics> {
    const query = new URLSearchParams();
    if (days !== undefined) query.set("days", String(days));
    return this.requestJson<CreatorAnalytics>("GET", "/me/analytics", {
      auth: true,
      query,
      options,
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  /** The public-visibility review queue (`GET /admin/queue`). */
  async adminListQueue(
    options?: StoreRequestOptions,
  ): Promise<AdminQueueItem[]> {
    const body = await this.requestJson<{ items: AdminQueueItem[] }>(
      "GET",
      "/admin/queue",
      { auth: true, options },
    );
    return body.items;
  }

  /** Approve (make public) or reject a queued agent (`POST /admin/queue/{id}`). */
  async adminActOnQueueItem(
    id: string,
    action: "approve" | "reject",
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send("POST", `/admin/queue/${encodeURIComponent(id)}`, {
      auth: true,
      body: { action },
      options,
    });
  }

  /** The abuse reports, optionally filtered by status (`GET /admin/reports`). */
  async adminListReports(
    status?: ReportStatus,
    options?: StoreRequestOptions,
  ): Promise<AdminReport[]> {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    const body = await this.requestJson<{ items: AdminReport[] }>(
      "GET",
      "/admin/reports",
      { auth: true, query, options },
    );
    return body.items;
  }

  /** Resolve or dismiss a report (`POST /admin/reports/{id}`). */
  async adminActOnReport(
    id: string,
    action: "resolve" | "dismiss",
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send("POST", `/admin/reports/${encodeURIComponent(id)}`, {
      auth: true,
      body: { action },
      options,
    });
  }

  /** Run the retention purge of stale drafts and expired soft-deletes. */
  adminPurge(options?: StoreRequestOptions): Promise<PurgeResult> {
    return this.requestJson<PurgeResult>("POST", "/admin/purge", {
      auth: true,
      options,
    });
  }

  /** Set or clear a creator's verified badge (`POST /admin/creators/{handle}/verify`). */
  async adminSetCreatorVerified(
    handle: string,
    verified: boolean,
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send(
      "POST",
      `/admin/creators/${encodeURIComponent(handle)}/verify`,
      { auth: true, body: { verified }, options },
    );
  }

  /** Release (null) a creator's handle (`POST /admin/creators/{handle}/release`). */
  async adminReleaseHandle(
    handle: string,
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send(
      "POST",
      `/admin/creators/${encodeURIComponent(handle)}/release`,
      { auth: true, options },
    );
  }

  /** The creator abuse reports, optionally filtered by status. */
  async adminListCreatorReports(
    status?: ReportStatus,
    options?: StoreRequestOptions,
  ): Promise<CreatorReport[]> {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    const body = await this.requestJson<{ items: CreatorReport[] }>(
      "GET",
      "/admin/creator-reports",
      { auth: true, query, options },
    );
    return body.items;
  }

  /** Resolve or dismiss a creator report (`POST /admin/creator-reports/{id}`). */
  async adminActOnCreatorReport(
    id: string,
    action: "resolve" | "dismiss",
    options?: StoreRequestOptions,
  ): Promise<void> {
    await this.send(
      "POST",
      `/admin/creator-reports/${encodeURIComponent(id)}`,
      { auth: true, body: { action }, options },
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Absolute URL for a store API path, with the query string appended. */
  private url(path: string, query?: URLSearchParams): string {
    const qs = query?.toString();
    return `${this.baseUrl}${STORE_API_PREFIX}${path}${qs ? `?${qs}` : ""}`;
  }

  /** Resolve the `Authorization` header value, throwing 401-shaped when absent. */
  private async authorization(): Promise<string> {
    const token = this.getToken ? await this.getToken() : null;
    if (!token) {
      throw new StoreApiError(401, "authentication required", null, null);
    }
    return `Bearer ${token}`;
  }

  /** Issue a request, mapping every failure to a {@link StoreApiError}. */
  private async send(
    method: string,
    path: string,
    spec: SendSpec,
  ): Promise<Response> {
    const headers = new Headers();
    let body: BodyInit | undefined;
    if (spec.body instanceof FormData) {
      // Multipart: let fetch derive the Content-Type (with its boundary); setting
      // it manually would break the parse on the gateway.
      body = spec.body;
    } else if (spec.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(spec.body);
    }
    if (spec.auth) headers.set("authorization", await this.authorization());
    if (spec.options?.headers) {
      for (const [key, value] of Object.entries(spec.options.headers)) {
        headers.set(key, value);
      }
    }
    if (spec.options?.init?.headers) {
      new Headers(spec.options.init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    const url = this.url(path, spec.query);
    const doFetch = this.fetchImpl;
    let res: Response;
    try {
      res = await doFetch(url, {
        ...spec.options?.init,
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
      });
    } catch (err) {
      throw new StoreApiError(
        0,
        err instanceof Error ? err.message : "network request failed",
        null,
        err,
      );
    }
    if (!res.ok) throw await toStoreApiError(res);
    return res;
  }

  /** Issue a request and parse a JSON body, mapping a parse failure to an error. */
  private async requestJson<T>(
    method: string,
    path: string,
    spec: SendSpec,
  ): Promise<T> {
    const res = await this.send(method, path, spec);
    const raw = await res.text();
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new StoreApiError(
        res.status,
        "invalid JSON in gateway response",
        null,
        raw,
      );
    }
  }
}

/** Encode catalog list params into a query string, dropping empty values. */
function catalogQuery(query: StoreCatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.integration?.trim())
    params.set("integration", query.integration.trim());
  if (query.creator?.trim()) params.set("creator", query.creator.trim());
  if (query.sort) params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

/** Read a non-OK gateway response into a {@link StoreApiError}. */
async function toStoreApiError(res: Response): Promise<StoreApiError> {
  const raw = await res.text().catch(() => "");
  let message = `Gateway request failed (${res.status}).`;
  let code: string | null = null;
  let body: unknown = raw;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      body = parsed;
      if (parsed && typeof parsed === "object") {
        const envelope = parsed as { error?: unknown; code?: unknown };
        if (typeof envelope.error === "string" && envelope.error) {
          message = envelope.error;
          code = envelope.error;
        }
        if (typeof envelope.code === "string" && envelope.code)
          code = envelope.code;
      }
    } catch {
      // Non-JSON error bodies keep the status-based message and raw text body.
    }
  }
  return new StoreApiError(res.status, message, code, body);
}
