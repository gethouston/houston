import type { IntegrationProvider } from "./provider";
import type {
  AccountIdentity,
  ActionResult,
  ConnectStart,
  Connection,
  LoginResult,
  LoginStart,
  ProviderCredential,
  ToolMatch,
  Toolkit,
} from "./types";

/**
 * The Composio adapter — the first IntegrationProvider. Speaks Composio's v3
 * REST API directly (no bundled CLI: the old engine shipped a per-arch binary
 * the agent shelled out to; we call the same hosted API in-process instead).
 *
 * Credential model = each user's OWN free Composio account (the "Composio for
 * you" consumer product), NOT a Houston platform key. cred.data carries that
 * user's personal `apiKey` (sent as `x-user-api-key`) + their consumer `userId`.
 *
 * Endpoint provenance: the consumer/session/toolkit paths below are taken from
 * Composio's own open-source CLI client + the Rust `houston-composio` crate +
 * the public API reference (all cross-checked). Three flows are NOT wired here
 * and are explicitly slice (b)/(c): startLogin/pollLogin (the CLI does this via
 * `@composio/client`.createSession — no documented raw path, so we wire the SDK
 * when we add the login UX), and search/connect bodies are marked TODO(live) to
 * confirm against a real account before they go user-facing.
 */

const DEFAULT_BASE_URL = "https://backend.composio.dev";

interface ComposioCred {
  apiKey: string;
  /** The consumer user id this key acts as (resolved at login). */
  userId?: string;
  orgId?: string;
}

interface CallOpts {
  method?: "GET" | "POST" | "DELETE";
  apiKey: string;
  orgId?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Treat these statuses as "no" rather than an error (e.g. 401 → invalid key). */
  nullStatuses?: number[];
}

export interface ComposioOptions {
  /** Override for tests / self-host pointing at a different Composio backend. */
  baseURL?: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export class ComposioProvider implements IntegrationProvider {
  readonly id = "composio";
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ComposioOptions = {}) {
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private toCred(cred: ProviderCredential): ComposioCred {
    if (cred.provider !== this.id) {
      throw new Error(`credential is for '${cred.provider}', not '${this.id}'`);
    }
    const d = cred.data as Partial<ComposioCred>;
    if (!d.apiKey || typeof d.apiKey !== "string") {
      throw new Error("composio credential missing 'apiKey'");
    }
    return { apiKey: d.apiKey, userId: d.userId, orgId: d.orgId };
  }

  /**
   * One HTTP call. Non-2xx surfaces as a thrown error (beta policy: no silent
   * failures) UNLESS the status is in `nullStatuses` (→ returns null), which
   * lets verifyCredential treat 401 as "invalid key" rather than a crash.
   */
  private async call<T>(path: string, opts: CallOpts): Promise<T | null> {
    const url = new URL(`${this.baseURL}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = { "x-user-api-key": opts.apiKey };
    if (opts.orgId) headers["x-org-id"] = opts.orgId;
    if (opts.body !== undefined) headers["content-type"] = "application/json";

    const res = await this.fetchImpl(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (opts.nullStatuses?.includes(res.status)) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`composio ${opts.method ?? "GET"} ${path} → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }

  async verifyCredential(cred: ProviderCredential): Promise<AccountIdentity | null> {
    const c = this.toCred(cred);
    // GET /api/v3/auth/session/info (x-user-api-key) — 401/403 ⇒ the key is bad.
    const info = await this.call<{ org_member?: { id?: string; user_id?: string; email?: string } }>(
      "/api/v3/auth/session/info",
      { apiKey: c.apiKey, orgId: c.orgId, nullStatuses: [401, 403] },
    );
    if (!info) return null;
    const m = info.org_member ?? {};
    const accountId = m.user_id ?? m.id;
    if (!accountId) return null;
    return { accountId, email: m.email };
  }

  async listToolkits(cred: ProviderCredential): Promise<Toolkit[]> {
    const c = this.toCred(cred);
    const body = await this.call<{ items?: RawToolkit[] }>("/api/v3/toolkits", {
      apiKey: c.apiKey,
      orgId: c.orgId,
      query: { limit: "1000" },
    });
    return (body?.items ?? []).map(mapToolkit);
  }

  async listConnections(cred: ProviderCredential): Promise<Connection[]> {
    const c = this.toCred(cred);
    if (!c.userId) throw new Error("composio credential missing 'userId' (resolved at login)");
    // GET /api/v3/org/consumer/connected_toolkits?user_id=… (the "Composio for
    // you" consumer namespace — the same one `composio execute` reads).
    const body = await this.call<{ toolkits?: RawConnection[] }>(
      "/api/v3/org/consumer/connected_toolkits",
      { apiKey: c.apiKey, orgId: c.orgId, query: { user_id: c.userId } },
    );
    return (body?.toolkits ?? []).map(mapConnection);
  }

  async disconnect(cred: ProviderCredential, toolkit: string): Promise<void> {
    const c = this.toCred(cred);
    if (!c.userId) throw new Error("composio credential missing 'userId'");
    // Remove every connected account for the toolkit (a toolkit can have more
    // than one, e.g. two Gmail logins). List then DELETE each — both confirmed.
    const accounts = await this.call<{ items?: { id: string }[] }>("/api/v3/connected_accounts", {
      apiKey: c.apiKey,
      orgId: c.orgId,
      query: { user_ids: c.userId, toolkit_slugs: toolkit },
    });
    for (const acct of accounts?.items ?? []) {
      await this.call(`/api/v3/connected_accounts/${encodeURIComponent(acct.id)}`, {
        method: "DELETE",
        apiKey: c.apiKey,
        orgId: c.orgId,
      });
    }
  }

  async execute(cred: ProviderCredential, action: string, params: Record<string, unknown>): Promise<ActionResult> {
    const c = this.toCred(cred);
    if (!c.userId) throw new Error("composio credential missing 'userId'");
    // POST /api/v3/tools/execute/{action} with the user's id + arguments.
    const body = await this.call<RawExecute>(`/api/v3/tools/execute/${encodeURIComponent(action)}`, {
      method: "POST",
      apiKey: c.apiKey,
      orgId: c.orgId,
      body: { user_id: c.userId, arguments: params },
    });
    return mapExecute(body);
  }

  async search(cred: ProviderCredential, query: string): Promise<ToolMatch[]> {
    const c = this.toCred(cred);
    // TODO(live): confirm the discovery endpoint/params against a real account.
    // GET /api/v3/tools?search=… is the plausible path; the response mapping is
    // what matters and is locked by the unit test, so wiring the confirmed path
    // later is a one-line change here.
    const body = await this.call<{ items?: RawTool[] }>("/api/v3/tools", {
      apiKey: c.apiKey,
      orgId: c.orgId,
      query: { search: query, limit: "10" },
    });
    return (body?.items ?? []).map(mapTool);
  }

  // ── Per-user login + connect: slice (b) (login uses @composio/client's
  // createSession — no documented raw path — and the consumer connect body
  // needs live confirmation; wired with the connect UX). Declared so the port
  // is complete; they fail loudly rather than pretend to work. ───────────────
  async startLogin(): Promise<LoginStart> {
    throw new Error("composio startLogin is wired in slice (b) via @composio/client.createSession");
  }
  async pollLogin(_pollKey: string): Promise<LoginResult> {
    throw new Error("composio pollLogin is wired in slice (b)");
  }
  async connect(_cred: ProviderCredential, _toolkit: string): Promise<ConnectStart> {
    throw new Error("composio connect is wired in slice (b) with the connect UX");
  }
}

// ── Wire → port mapping (the only place Composio's shapes are known) ──────────

interface RawToolkit {
  slug?: string;
  name?: string;
  meta?: { description?: string; logo?: string };
  description?: string;
  logo_url?: string;
  categories?: (string | { name?: string })[];
}
interface RawConnection {
  toolkit?: string;
  slug?: string;
  connected_account_id?: string;
  id?: string;
  status?: string;
}
interface RawTool {
  slug?: string;
  name?: string;
  toolkit?: { slug?: string } | string;
  description?: string;
  input_parameters?: unknown;
}
interface RawExecute {
  successful?: boolean;
  success?: boolean;
  data?: unknown;
  error?: string | null;
}

function mapToolkit(t: RawToolkit): Toolkit {
  return {
    slug: t.slug ?? "",
    name: t.name ?? t.slug ?? "",
    description: t.meta?.description ?? t.description,
    logoUrl: t.meta?.logo ?? t.logo_url,
    categories: (t.categories ?? []).map((c) => (typeof c === "string" ? c : (c.name ?? ""))).filter(Boolean),
  };
}

function mapConnection(c: RawConnection): Connection {
  const status = c.status?.toLowerCase();
  return {
    toolkit: c.toolkit ?? c.slug ?? "",
    connectionId: c.connected_account_id ?? c.id ?? "",
    status: status === "active" || status === "pending" || status === "error" ? status : "active",
  };
}

function mapTool(t: RawTool): ToolMatch {
  const toolkit = typeof t.toolkit === "string" ? t.toolkit : (t.toolkit?.slug ?? "");
  return {
    action: t.slug ?? "",
    toolkit,
    description: t.description ?? "",
    inputParams: t.input_parameters,
  };
}

function mapExecute(r: RawExecute | null): ActionResult {
  if (!r) return { successful: false, error: "empty response" };
  const successful = r.successful ?? r.success ?? !r.error;
  return { successful, data: r.data, error: r.error ?? undefined };
}
