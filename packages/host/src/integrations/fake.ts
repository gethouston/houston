import type { IntegrationProviderId } from "@houston/protocol";
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

export class FakeIntegrationProvider implements IntegrationProvider {
  readonly id: IntegrationProviderId;
  private readonly toolkits: Toolkit[];
  private readonly actions: ToolMatch[];
  private readonly connections = new Map<string, Connection[]>();
  private notReady = false;
  throwSigninRequired = false;
  throwSearchExecute?: Error;
  lastActing: ActingContext | undefined;
  lastApp: string | undefined;
  lastAccount: string | undefined;
  private seq = 0;

  constructor(
    opts: {
      id?: IntegrationProviderId;
      toolkits?: Toolkit[];
      actions?: ToolMatch[];
    } = {},
  ) {
    this.id = opts.id ?? "composio";
    this.toolkits = opts.toolkits ?? [{ slug: "gmail", name: "Gmail" }];
    this.actions = opts.actions ?? [
      {
        action: "GMAIL_SEND_EMAIL",
        toolkit: "gmail",
        description: "Send an email",
      },
    ];
  }

  setNotReady(notReady = true): void {
    this.notReady = notReady;
  }

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
