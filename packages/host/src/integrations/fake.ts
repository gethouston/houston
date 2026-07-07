import type {
  ActingContext,
  ExecuteOptions,
  IntegrationProvider,
} from "./provider";
import {
  type ActionResult,
  type Connection,
  type ConnectStart,
  IntegrationSigninRequiredError,
  type ProviderReadiness,
  type SearchResult,
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
  /** Test helper: the pinned account of the most recent execute call. */
  lastAccount: string | undefined;
  private seq = 0;

  constructor(
    opts: { id?: string; toolkits?: Toolkit[]; actions?: ToolMatch[] } = {},
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

  /** Test helper: finish a started connect so the connection turns active. */
  completeConnection(userId: string, connectionId: string): void {
    const conn = (this.connections.get(userId) ?? []).find(
      (c) => c.connectionId === connectionId,
    );
    if (conn) conn.status = "active";
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

  async disconnect(userId: string, connectionId: string): Promise<void> {
    // Per account: verify ownership, then drop just that one — a miss surfaces
    // rather than silently no-op (parity with the real ownership guard).
    const list = this.connections.get(userId) ?? [];
    if (!list.some((c) => c.connectionId === connectionId))
      throw new Error(`fake: connection '${connectionId}' not found`);
    this.connections.set(
      userId,
      list.filter((c) => c.connectionId !== connectionId),
    );
  }

  async rename(
    userId: string,
    connectionId: string,
    alias: string,
  ): Promise<void> {
    const conn = (this.connections.get(userId) ?? []).find(
      (c) => c.connectionId === connectionId,
    );
    if (!conn) throw new Error(`fake: connection '${connectionId}' not found`);
    conn.accountLabel = alias;
  }

  async search(
    userId: string,
    query: string,
    acting?: ActingContext,
  ): Promise<SearchResult> {
    this.lastActing = acting;
    if (this.throwSigninRequired) throw new IntegrationSigninRequiredError();
    if (this.throwSearchExecute) throw this.throwSearchExecute;
    const q = query.toLowerCase();
    const activeToolkits = new Set(
      (this.connections.get(userId) ?? [])
        .filter((c) => c.status === "active")
        .map((c) => c.toolkit),
    );
    const items: ToolMatch[] = this.actions
      .filter(
        (a) =>
          a.description.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q),
      )
      .map((a) => ({ ...a, connected: activeToolkits.has(a.toolkit) }));
    // Raw adapter: `items` only — the policy layer adds `accounts`.
    return { items };
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
    opts?: ExecuteOptions,
  ): Promise<ActionResult> {
    this.lastActing = opts?.acting;
    this.lastAccount = opts?.account;
    if (this.throwSigninRequired) throw new IntegrationSigninRequiredError();
    if (this.throwSearchExecute) throw this.throwSearchExecute;
    return { successful: true, data: { action, params } };
  }
}
