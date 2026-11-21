import { StoreApiError } from "./errors.ts";
import type {
  AdminGrantHandleInput,
  AdminQueueItem,
  AdminReport,
  AgentPatch,
  AvatarUploadResult,
  ClaimInput,
  ClaimResult,
  CreateAgentRequest,
  CreateAgentResponse,
  CreatorAnalytics,
  CreatorDirectoryPage,
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
  StoreAgentSummary,
  StoreCatalogPage,
  StoreCatalogQuery,
  StoreCatalogSort,
  StoreCategory,
  StoreCreatorPage,
  StoreInstallTarget,
} from "./types.ts";

export const STORE_API_PREFIX = "/v1/agentstore";

export interface StoreClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getToken?: () => string | null | Promise<string | null>;
}

export interface StoreRequestOptions {
  init?: RequestInit;
  headers?: Record<string, string>;
}

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

  async listAgents(
    query: StoreCatalogQuery = {},
    options?: StoreRequestOptions,
  ): Promise<StoreCatalogPage> {
    const page = await this.requestJson<StoreCatalogPage>("GET", "/agents", {
      query: catalogQuery(query),
      options,
    });
    return normalizeCatalogPage(page);
  }

  async getAgent(
    slug: string,
    options?: StoreRequestOptions,
  ): Promise<StoreAgentDetail> {
    const detail = await this.requestJson<StoreAgentDetail>(
      "GET",
      `/agents/${encodeURIComponent(slug)}`,
      { options },
    );
    return { ...detail, agent: normalizeAgentSummary(detail.agent) };
  }

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

  async getCreator(
    handle: string,
    query: { page?: number; sort?: StoreCatalogSort } = {},
    options?: StoreRequestOptions,
  ): Promise<StoreCreatorPage> {
    const params = new URLSearchParams();
    if (query.sort) params.set("sort", query.sort);
    if (query.page && query.page > 1) params.set("page", String(query.page));
    const page = await this.requestJson<StoreCreatorPage>(
      "GET",
      `/creators/${encodeURIComponent(handle)}`,
      { query: params, options },
    );
    return { ...page, agents: normalizeCatalogPage(page.agents) };
  }

  listCreators(
    page = 1,
    options?: StoreRequestOptions,
  ): Promise<CreatorDirectoryPage> {
    const query = new URLSearchParams();
    if (page > 1) query.set("page", String(page));
    return this.requestJson<CreatorDirectoryPage>("GET", "/creators", {
      query,
      options,
    });
  }

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

  async listMyAgents(options?: StoreRequestOptions): Promise<MyAgent[]> {
    const body = await this.requestJson<{ items: MyAgent[] }>(
      "GET",
      "/me/agents",
      {
        auth: true,
        options,
      },
    );
    return body.items.map(normalizeAgentSummary);
  }

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

  async patchAgent(
    id: string,
    patch: AgentPatch,
    options?: StoreRequestOptions,
  ): Promise<PatchAgentResponse> {
    const response = await this.requestJson<PatchAgentResponse>(
      "PATCH",
      `/agents/${encodeURIComponent(id)}`,
      { auth: true, body: patch, options },
    );
    return { ...response, agent: normalizeAgentSummary(response.agent) };
  }

  async deleteAgent(id: string, options?: StoreRequestOptions): Promise<void> {
    await this.send("DELETE", `/agents/${encodeURIComponent(id)}`, {
      auth: true,
      options,
    });
  }

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

  async deleteAvatar(options?: StoreRequestOptions): Promise<void> {
    await this.send("DELETE", "/me/avatar", { auth: true, options });
  }

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

  async adminListQueue(
    options?: StoreRequestOptions,
  ): Promise<AdminQueueItem[]> {
    const body = await this.requestJson<{ items: AdminQueueItem[] }>(
      "GET",
      "/admin/queue",
      { auth: true, options },
    );
    return body.items.map(normalizeAgentSummary);
  }

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

  adminPurge(options?: StoreRequestOptions): Promise<PurgeResult> {
    return this.requestJson<PurgeResult>("POST", "/admin/purge", {
      auth: true,
      options,
    });
  }

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

  async adminGrantCreatorHandle(
    handle: string,
    input: AdminGrantHandleInput,
    options?: StoreRequestOptions,
  ): Promise<CreatorProfile> {
    const body = await this.requestJson<{ profile: CreatorProfile }>(
      "POST",
      `/admin/creators/${encodeURIComponent(handle)}/grant`,
      { auth: true, body: input, options },
    );
    return body.profile;
  }

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

  private url(path: string, query?: URLSearchParams): string {
    const qs = query?.toString();
    return `${this.baseUrl}${STORE_API_PREFIX}${path}${qs ? `?${qs}` : ""}`;
  }

  private async authorization(): Promise<string> {
    const token = this.getToken ? await this.getToken() : null;
    if (!token) {
      throw new StoreApiError(401, "authentication required", null, null);
    }
    return `Bearer ${token}`;
  }

  private async send(
    method: string,
    path: string,
    spec: SendSpec,
  ): Promise<Response> {
    const headers = new Headers();
    let body: BodyInit | undefined;
    if (spec.body instanceof FormData) {
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

function normalizeAgentSummary(agent: StoreAgentSummary): StoreAgentSummary {
  return { ...agent, skills: agent.skills ?? [] };
}

function normalizeCatalogPage(page: StoreCatalogPage): StoreCatalogPage {
  return { ...page, items: page.items.map(normalizeAgentSummary) };
}

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
    } catch {}
  }
  return new StoreApiError(res.status, message, code, body);
}
