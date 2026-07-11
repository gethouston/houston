import type { ActingContext, IntegrationProvider } from "./provider";
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
    // The colon mirrors real MCP connection ids ("mcp:<server>") so route
    // tests exercise the URL-encoding round-trip, not just benign UUIDs.
    const connectionId = `conn:${++this.seq}`;
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

  async disconnect(userId: string, toolkit: string): Promise<void> {
    this.connections.set(
      userId,
      (this.connections.get(userId) ?? []).filter((c) => c.toolkit !== toolkit),
    );
  }

  async search(
    userId: string,
    query: string,
    acting?: ActingContext,
  ): Promise<ToolMatch[]> {
    this.lastActing = acting;
    if (this.throwSigninRequired) throw new IntegrationSigninRequiredError();
    if (this.throwSearchExecute) throw this.throwSearchExecute;
    const q = query.toLowerCase();
    const activeToolkits = new Set(
      (this.connections.get(userId) ?? [])
        .filter((c) => c.status === "active")
        .map((c) => c.toolkit),
    );
    return this.actions
      .filter(
        (a) =>
          a.description.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q),
      )
      .map((a) => {
        const connected = activeToolkits.has(a.toolkit);
        return {
          ...a,
          connected,
          status: connected ? ("connected" as const) : ("connectable" as const),
        };
      });
  }

  async execute(
    _userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
  ): Promise<ActionResult> {
    this.lastActing = acting;
    if (this.throwSigninRequired) throw new IntegrationSigninRequiredError();
    if (this.throwSearchExecute) throw this.throwSearchExecute;
    return { successful: true, data: { action, params } };
  }
}
