/**
 * Provider-agnostic types for third-party integrations (Gmail, Calendar, Slack…).
 *
 * These are the shapes the host + the agent's generic tools speak; NO provider
 * (Composio or a future one) leaks its own wire types past the adapter. Adding a
 * second provider later means a new `IntegrationProvider` adapter that maps ITS
 * wire onto these — nothing above the port changes.
 *
 * Credential model (platform): Houston holds ONE platform API key with the
 * provider; end users are plain opaque `userId` strings (the verified Houston
 * identity). There is no per-user provider account and no per-user credential
 * to store — a user's state (which apps they connected) lives with the
 * provider, keyed by that userId.
 */

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
  /**
   * Human-readable name for THIS account (a toolkit can have several — two
   * Gmail logins). The user's alias if they set one, else a value derived from
   * the account (email/username/…); absent when nothing identifies it.
   */
  accountLabel?: string;
}

/**
 * One connected account of the acting agent, surfaced alongside search results
 * so the model can name the account to pass to execute() when a toolkit has
 * more than one. The policy layer attaches these; raw adapters do not.
 */
export interface ConnectedAccountInfo {
  toolkit: string;
  connectionId: string;
  accountLabel?: string;
}

/** The OAuth hand-off to authorize a toolkit (returned by connect()). */
export interface ConnectStart {
  /** Where to send the user's browser to authorize the app. */
  redirectUrl: string;
  /** Poll `connection()` with this until the user finishes authorizing. */
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
  /**
   * Whether the user has an active connection to this action's toolkit.
   * `false` means execute() would fail — the agent should offer the in-chat
   * connect card instead (HOU-670). Absent = unknown (older adapters).
   */
  connected?: boolean;
}

/**
 * The result of a search(): the matched actions, plus (when the policy layer
 * adds them) the acting agent's granted accounts so the model can pick one to
 * pass to execute(). Direct adapters return `items` only.
 */
export interface SearchResult {
  items: ToolMatch[];
  accounts?: ConnectedAccountInfo[];
}

/** The outcome of running an action. */
export interface ActionResult {
  successful: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Whether the provider can serve this deployment's user right now. A direct
 * (platform-key) adapter is always ready; the desktop gateway adapter is ready
 * only once the user is signed in to Houston (it forwards with their session).
 */
export interface ProviderReadiness {
  ready: boolean;
  /** Why not ready — "signin" ⇒ the UI prompts a Houston sign-in. */
  reason?: "signin";
}

/**
 * Thrown by an adapter when the call cannot proceed until the user signs in to
 * Houston (the desktop gateway has no session token to forward). Routes map it
 * to 409 + code "signin_required" so the UI/agent get an actionable reason, not
 * a generic failure.
 */
export class IntegrationSigninRequiredError extends Error {
  constructor() {
    super("sign in to Houston to use integrations");
    this.name = "IntegrationSigninRequiredError";
  }
}

/**
 * A gateway/provider response that is already user-actionable. Routes relay its
 * status + body instead of hiding policy failures behind a generic 500.
 */
export class IntegrationUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `integrations upstream returned ${status}`);
    this.name = "IntegrationUpstreamError";
  }
}

/**
 * A json content-type is a claim, not a guarantee — a malformed body (a
 * truncated proxy error, an HTML error page mislabeled json) must still yield
 * the typed upstream error carrying the REAL status, not a SyntaxError that
 * callers bury behind a generic 500. Fall back to the raw text as the detail.
 */
function parseJsonOrRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function integrationUpstreamErrorFromResponse(
  res: Response,
  context: string,
): Promise<IntegrationUpstreamError> {
  const raw = await res.text();
  const body = raw
    ? res.headers.get("content-type")?.includes("json")
      ? parseJsonOrRaw(raw)
      : raw
    : { error: `integrations upstream returned ${res.status}` };
  return new IntegrationUpstreamError(
    res.status,
    body,
    `${context} → ${res.status}${raw ? `: ${raw.slice(0, 300)}` : ""}`,
  );
}
