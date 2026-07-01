/**
 * Provider-agnostic types for third-party integrations (Gmail, Calendar, Slack…).
 *
 * These are the shapes the host + the agent's generic tools speak; NO provider
 * (Composio or a future one) leaks its own wire types past the adapter. Adding a
 * second provider later means a new `IntegrationProvider` adapter that maps ITS
 * wire onto these — nothing above the port changes.
 */

/**
 * One user's credential for one provider. The `data` is opaque to everyone but
 * the provider that minted it (Composio: `{ apiKey, userId, orgId }`). The host
 * stores it per user and hands it back; it never reaches the agent runtime
 * (the runtime proxies execution through the host — see the /sandbox proxy).
 */
export interface ProviderCredential {
  /** Matches IntegrationProvider.id, e.g. "composio". */
  provider: string;
  /** Provider-defined opaque payload. Only that provider's adapter reads it. */
  data: Record<string, unknown>;
}

/** Who a credential authenticates — used to confirm a stored key is still valid. */
export interface AccountIdentity {
  accountId: string;
  email?: string;
}

/** A connectable app (the catalog the user picks from). */
export interface Toolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
}

/** A user's established connection to one toolkit. */
export interface Connection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
}

/** The OAuth hand-off to authorize a toolkit (returned by connect()). */
export interface ConnectStart {
  /** Where to send the user's browser to authorize the app. */
  redirectUrl: string;
  connectionId: string;
}

/** One action the agent could run, discovered via search(). */
export interface ToolMatch {
  /** The slug passed to execute(), e.g. "GMAIL_SEND_EMAIL". */
  action: string;
  toolkit: string;
  description: string;
  /** JSON-schema-shaped description of the action's params, for the model. */
  inputParams?: unknown;
}

/** The outcome of running an action. */
export interface ActionResult {
  successful: boolean;
  data?: unknown;
  error?: string;
}

/** Start of the per-user sign-in flow (the user logs into THEIR own account). */
export interface LoginStart {
  /** Provider sign-in URL to open in the user's browser. */
  loginUrl: string;
  /** Opaque key the host polls with until the user finishes signing in. */
  pollKey: string;
}

/** Result of polling a login: still waiting, or done with the user's credential. */
export type LoginResult =
  | { status: "pending" }
  | { status: "linked"; credential: ProviderCredential };
