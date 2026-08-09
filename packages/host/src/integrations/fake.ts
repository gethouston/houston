import type {
  ActingContext,
  IntegrationProvider,
  ProviderSearchResult,
} from "./provider";
import { resolveScopeRows } from "./scope-resolve";
import {
  type ActionResult,
  type Connection,
  type ConnectStart,
  IntegrationSigninRequiredError,
  type ProviderReadiness,
  type Toolkit,
  type ToolMatch,
} from "./types";

/**
 * An in-memory IntegrationProvider — the second implementation of the port (so
 * the contract test proves the interface isn't accidentally Composio-shaped),
 * and the double the host + the agent tool tests run against without touching
 * a real provider. Connections start pending (like a real OAuth hand-off) and
 * are completed by the test via `completeConnection`.
 */
export class FakeIntegrationProvider implements IntegrationProvider {
  readonly id: string;
  private readonly toolkits: Toolkit[];
  private readonly actions: ToolMatch[];
  /** userId → that user's connections. */
  private readonly connections = new Map<string, Connection[]>();
  private notReady = false;
  /** Test helper: scoped calls throw like a signed-out gateway adapter. */
  throwSigninRequired = false;
  /** Test helper: search/execute throw a caller-provided provider error. */
  throwSearchExecute?: Error;
  /** Test helper: the acting context of the most recent search/execute call. */
  lastActing: ActingContext | undefined;
  /** Test helper: the app scope of the most recent search call. */
  lastApp: string | undefined;
  /** Test helper: the account targeted by the most recent execute call. */
  lastAccount: string | undefined;
  private seq = 0;

  constructor(
    opts: {
      id?: string;
      toolkits?: Toolkit[];
      actions?: ToolMatch[];
    } = {},
  ) {
    this.id = opts.id ?? "fake";
    this.toolkits = opts.toolkits ?? [{ slug: "gmail", name: "Gmail" }];
    this.actions = opts.actions ?? [
      {
        action: "GMAIL_SEND_EMAIL",
        toolkit: "gmail",
        description: "Send an email",
      },
    ];
  }

  /** Test helper: make readiness report signin-required (gateway signed out). */
  setNotReady(notReady = true): void {
    this.notReady = notReady;
  }

  /** Test helper: finish a started connect so the connection turns active,
   *  optionally stamping the account's human label (as a real OAuth would). */
  completeConnection(
    userId: string,
    connectionId: string,
    accountLabel?: string,
  ): void {
    const conn = (this.connections.get(userId) ?? []).find(
      (c) => c.connectionId === connectionId,
    );
    if (!conn) return;
    conn.status = "active";
    if (accountLabel) conn.accountLabel = accountLabel;
  }

  async readiness(): Promise<ProviderReadiness> {
    return this.notReady ? { ready: false, reason: "signin" } : { ready: true };
  }

  async listToolkits(): Promise<Toolkit[]> {
    return [...this.toolkits];
  }

  async listConnections(userId: string): Promise<Connection[]> {
    return (this.connections.get(userId) ?? []).map((c) => ({ ...c }));
  }

  async connect(userId: string, toolkit: string): Promise<ConnectStart> {
    const connectionId = `conn-${++this.seq}`;
    const list = this.connections.get(userId) ?? [];
    list.push({ toolkit, connectionId, status: "pending" });
    this.connections.set(userId, list);
    return {
      redirectUrl: `https://fake.local/connect/${toolkit}/${connectionId}`,
      connectionId,
    };
  }

  async connection(
    userId: string,
    connectionId: string,
  ): Promise<Connection | null> {
    const conn = (this.connections.get(userId) ?? []).find(
      (c) => c.connectionId === connectionId,
    );
    return conn ? { ...conn } : null;
  }

  async disconnect(
    userId: string,
    toolkit: string,
    connectionId?: string,
  ): Promise<void> {
    this.connections.set(
      userId,
      (this.connections.get(userId) ?? []).filter((c) =>
        connectionId ? c.connectionId !== connectionId : c.toolkit !== toolkit,
      ),
    );
  }

  async search(
    userId: string,
    query: string,
    acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult> {
    this.lastActing = acting;
    this.lastApp = app;
    if (this.throwSigninRequired) throw new IntegrationSigninRequiredError();
    if (this.throwSearchExecute) throw this.throwSearchExecute;
    const q = query.toLowerCase();
    const activeToolkits = new Set(
      (this.connections.get(userId) ?? [])
        .filter((c) => c.status === "active")
        .map((c) => c.toolkit),
    );
    const stamp = (a: ToolMatch): ToolMatch => {
      const connected = activeToolkits.has(a.toolkit);
      return {
        ...a,
        connected,
        status: connected ? ("connected" as const) : ("connectable" as const),
      };
    };
    const textMatches = (a: ToolMatch) =>
      a.description.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q);
    // Same contract as the real adapters: resolve the scope via the shared
    // rules, and a resolved scope yields at least the app's actions (listing
    // fallback when the phrasing scores zero) — never a bare empty result.
    if (app) {
      const rows = [...new Set(this.actions.map((a) => a.toolkit))].map(
        (slug) => ({ slug, name: slug }),
      );
      const scoped = resolveScopeRows(rows, app);
      if (scoped.length === 0) return { items: [], scope: "unresolved" };
      const slugs = new Set(scoped.map((r) => r.slug));
      const within = this.actions.filter((a) => slugs.has(a.toolkit));
      const hits = within.filter(textMatches);
      return {
        items: (hits.length > 0 ? hits : within).map(stamp),
        scope: "resolved",
      };
    }
    return { items: this.actions.filter(textMatches).map(stamp) };
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
    account?: string,
  ): Promise<ActionResult> {
    this.lastActing = acting;
    this.lastAccount = account;
    if (this.throwSigninRequired) throw new IntegrationSigninRequiredError();
    if (this.throwSearchExecute) throw this.throwSearchExecute;
    return { successful: true, data: { action, params } };
  }
}
