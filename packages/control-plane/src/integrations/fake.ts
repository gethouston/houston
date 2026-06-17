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
 * An in-memory IntegrationProvider — the second implementation of the port (so
 * the contract test proves the interface isn't accidentally Composio-shaped),
 * and the double the host + the agent tool tests will run against in later
 * slices without touching a real provider.
 */
export class FakeIntegrationProvider implements IntegrationProvider {
  readonly id: string;
  private readonly toolkits: Toolkit[];
  private readonly actions: ToolMatch[];
  private readonly connections = new Map<string, Connection[]>();
  private readonly pending = new Map<string, ProviderCredential>();
  private readonly invalidKeys = new Set<string>();
  private seq = 0;

  constructor(opts: { id?: string; toolkits?: Toolkit[]; actions?: ToolMatch[] } = {}) {
    this.id = opts.id ?? "fake";
    this.toolkits = opts.toolkits ?? [{ slug: "gmail", name: "Gmail" }];
    this.actions = opts.actions ?? [
      { action: "GMAIL_SEND_EMAIL", toolkit: "gmail", description: "Send an email" },
    ];
  }

  private userOf(cred: ProviderCredential): string {
    return String(cred.data.user ?? cred.data.userId ?? cred.data.apiKey ?? "");
  }

  /** Test helper: mark a credential's key invalid so verifyCredential returns null. */
  invalidate(key: string): void {
    this.invalidKeys.add(key);
  }

  /** Test helper: finish a started login so the next pollLogin returns linked. */
  completeLogin(pollKey: string, credential: ProviderCredential): void {
    this.pending.set(pollKey, credential);
  }

  async startLogin(): Promise<LoginStart> {
    const pollKey = `poll-${++this.seq}`;
    return { loginUrl: `https://fake.local/login/${pollKey}`, pollKey };
  }

  async pollLogin(pollKey: string): Promise<LoginResult> {
    const credential = this.pending.get(pollKey);
    return credential ? { status: "linked", credential } : { status: "pending" };
  }

  async verifyCredential(cred: ProviderCredential): Promise<AccountIdentity | null> {
    const key = String(cred.data.apiKey ?? this.userOf(cred));
    if (this.invalidKeys.has(key)) return null;
    return { accountId: this.userOf(cred) };
  }

  async listToolkits(_cred: ProviderCredential): Promise<Toolkit[]> {
    return [...this.toolkits];
  }

  async listConnections(cred: ProviderCredential): Promise<Connection[]> {
    return [...(this.connections.get(this.userOf(cred)) ?? [])];
  }

  async connect(cred: ProviderCredential, toolkit: string): Promise<ConnectStart> {
    const connectionId = `conn-${++this.seq}`;
    const user = this.userOf(cred);
    const list = this.connections.get(user) ?? [];
    list.push({ toolkit, connectionId, status: "active" });
    this.connections.set(user, list);
    return { redirectUrl: `https://fake.local/connect/${toolkit}/${connectionId}`, connectionId };
  }

  async disconnect(cred: ProviderCredential, toolkit: string): Promise<void> {
    const user = this.userOf(cred);
    this.connections.set(user, (this.connections.get(user) ?? []).filter((c) => c.toolkit !== toolkit));
  }

  async search(_cred: ProviderCredential, query: string): Promise<ToolMatch[]> {
    const q = query.toLowerCase();
    return this.actions.filter(
      (a) => a.description.toLowerCase().includes(q) || a.action.toLowerCase().includes(q),
    );
  }

  async execute(_cred: ProviderCredential, action: string, params: Record<string, unknown>): Promise<ActionResult> {
    return { successful: true, data: { action, params } };
  }
}
