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
const DEFAULT_WEB_URL = "https://dashboard.composio.dev";

interface ComposioCred {
  apiKey: string;
  /** The consumer user id this key acts as (resolved at login). */
  userId?: string;
  orgId?: string;
}

/**
 * The slice of `@composio/client`'s `cli` resource the login flow needs. Behind
 * a seam so the adapter's other methods (raw fetch) stay testable without the
 * SDK, and login tests can inject a fake instead of hitting the network.
 */
export interface ComposioLoginClient {
  createSession(params: {
    scope: "user" | "project";
  }): Promise<{ id: string; status?: string; expiresAt?: string }>;
  getSession(params: { id: string }): Promise<{
    status: string;
    api_key?: string;
    account?: { email?: string } | null;
  }>;
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
  /** The Composio web app the user signs into (the `?cliKey=` login page). */
  webURL?: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  /** Injected for tests; defaults to lazily constructing `@composio/client`. */
  loginClient?: ComposioLoginClient;
}

export class ComposioProvider implements IntegrationProvider {
  readonly id = "composio";
  private readonly baseURL: string;
  private readonly webURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly injectedLoginClient?: ComposioLoginClient;
  private cachedLoginClient?: ComposioLoginClient;

  constructor(opts: ComposioOptions = {}) {
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.webURL = (opts.webURL ?? DEFAULT_WEB_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.injectedLoginClient = opts.loginClient;
  }

  /** The Composio CLI-session client (real SDK unless a fake was injected). */
  private async loginClientFor(): Promise<ComposioLoginClient> {
    if (this.injectedLoginClient) return this.injectedLoginClient;
    if (!this.cachedLoginClient) {
      const { Composio } = await import("@composio/client");
      // No apiKey: the login bootstrap is for a brand-new user who has none yet.
      this.cachedLoginClient = new Composio({})
        .cli as unknown as ComposioLoginClient;
    }
    return this.cachedLoginClient;
  }

  /** session/info (org + email) + consumer project/resolve (the consumer user id). */
  private async resolveAccount(
    apiKey: string,
  ): Promise<{ orgId?: string; userId?: string; email?: string }> {
    const info = await this.call<{
      org_member?: { email?: string };
      project?: { org?: { id?: string } };
    }>("/api/v3/auth/session/info", { apiKey });
    const orgId = info?.project?.org?.id;
    const resolved = await this.call<{
      consumer_user_id?: string;
      user_id?: string;
    }>("/api/v3/org/consumer/project/resolve", {
      method: "POST",
      apiKey,
      orgId,
      body: {},
    });
    return {
      orgId,
      userId: resolved?.consumer_user_id ?? resolved?.user_id,
      email: info?.org_member?.email,
    };
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
      throw new Error(
        `composio ${opts.method ?? "GET"} ${path} → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }

  async verifyCredential(
    cred: ProviderCredential,
  ): Promise<AccountIdentity | null> {
    const c = this.toCred(cred);
    // GET /api/v3/auth/session/info (x-user-api-key) — 401/403 ⇒ the key is bad.
    const info = await this.call<{
      org_member?: { id?: string; user_id?: string; email?: string };
    }>("/api/v3/auth/session/info", {
      apiKey: c.apiKey,
      orgId: c.orgId,
      nullStatuses: [401, 403],
    });
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
    if (!c.userId)
      throw new Error(
        "composio credential missing 'userId' (resolved at login)",
      );
    // GET /api/v3/org/consumer/connected_toolkits?user_id=… (the "Composio for
    // you" consumer namespace — the same one `composio execute` reads). Verified
    // live: the `toolkits` array is plain slug STRINGS, e.g. ["gmail","github"]
    // (connection ids/status come from /connected_accounts when needed).
    const body = await this.call<{ toolkits?: (RawConnection | string)[] }>(
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
    const accounts = await this.call<{ items?: { id: string }[] }>(
      "/api/v3/connected_accounts",
      {
        apiKey: c.apiKey,
        orgId: c.orgId,
        query: { user_ids: c.userId, toolkit_slugs: toolkit },
      },
    );
    for (const acct of accounts?.items ?? []) {
      await this.call(
        `/api/v3/connected_accounts/${encodeURIComponent(acct.id)}`,
        {
          method: "DELETE",
          apiKey: c.apiKey,
          orgId: c.orgId,
        },
      );
    }
  }

  async execute(
    cred: ProviderCredential,
    action: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    const c = this.toCred(cred);
    if (!c.userId) throw new Error("composio credential missing 'userId'");
    // POST /api/v3/tools/execute/{action} with the user's id + arguments.
    const body = await this.call<RawExecute>(
      `/api/v3/tools/execute/${encodeURIComponent(action)}`,
      {
        method: "POST",
        apiKey: c.apiKey,
        orgId: c.orgId,
        body: { user_id: c.userId, arguments: params },
      },
    );
    return mapExecute(body);
  }

  async search(cred: ProviderCredential, query: string): Promise<ToolMatch[]> {
    const c = this.toCred(cred);
    // GET /api/v3/tools?search=… → { items: [{ slug, name, description, … }] }.
    // Verified live against a real account.
    const body = await this.call<{ items?: RawTool[] }>("/api/v3/tools", {
      apiKey: c.apiKey,
      orgId: c.orgId,
      query: { search: query, limit: "10" },
    });
    return (body?.items ?? []).map(mapTool);
  }

  /**
   * Begin the no-API-key sign-in: `@composio/client.cli.createSession` mints a
   * pending session; the user opens `${webURL}?cliKey=${id}` and signs into
   * THEIR own Composio account. The non-technical user never sees a key — they
   * just authorize in the browser. (Verified live against a real account.)
   */
  async startLogin(): Promise<LoginStart> {
    const cli = await this.loginClientFor();
    const session = await cli.createSession({ scope: "user" });
    return {
      loginUrl: `${this.webURL}/?cliKey=${session.id}`,
      pollKey: session.id,
    };
  }

  /**
   * Poll a started login. Until the user finishes, the session is non-"linked"
   * (→ pending). Once linked it carries the user's api_key; we resolve their
   * org + consumer user id and return the stored credential — the key is handed
   * to the host, never shown to the user or placed in the agent runtime.
   */
  async pollLogin(pollKey: string): Promise<LoginResult> {
    const cli = await this.loginClientFor();
    const session = await cli.getSession({ id: pollKey });
    if (session.status !== "linked" || !session.api_key)
      return { status: "pending" };
    const account = await this.resolveAccount(session.api_key);
    return {
      status: "linked",
      credential: {
        provider: this.id,
        data: {
          apiKey: session.api_key,
          orgId: account.orgId,
          userId: account.userId,
          email: account.email ?? session.account?.email ?? undefined,
        },
      },
    };
  }

  // connect (OAuth a specific toolkit, e.g. Gmail) is the next slice — it pairs
  // with the connect UI. Declared so the port is complete; fails loudly today.
  async connect(
    _cred: ProviderCredential,
    _toolkit: string,
  ): Promise<ConnectStart> {
    throw new Error("composio connect lands with the connect UX (next slice)");
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
    categories: (t.categories ?? [])
      .map((c) => (typeof c === "string" ? c : (c.name ?? "")))
      .filter(Boolean),
  };
}

function mapConnection(c: RawConnection | string): Connection {
  // The consumer connected_toolkits endpoint returns plain slug strings; the
  // object form is kept defensively for the per-account endpoints.
  if (typeof c === "string")
    return { toolkit: c, connectionId: "", status: "active" };
  const status = c.status?.toLowerCase();
  return {
    toolkit: c.toolkit ?? c.slug ?? "",
    connectionId: c.connected_account_id ?? c.id ?? "",
    status:
      status === "active" || status === "pending" || status === "error"
        ? status
        : "active",
  };
}

function mapTool(t: RawTool): ToolMatch {
  const toolkit =
    typeof t.toolkit === "string" ? t.toolkit : (t.toolkit?.slug ?? "");
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
