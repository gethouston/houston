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
}

/** The OAuth hand-off to authorize a toolkit (returned by connect()). */
export interface ConnectStart {
  /** Where to send the user's browser to authorize the app. */
  redirectUrl: string;
  /** Poll `connection()` with this until the user finishes authorizing. */
  connectionId: string;
}

/**
 * The app-level status of one search result, the load-bearing contract that
 * tells the agent which of four speech acts to perform (rendered by the runtime
 * tool, driven by the prompt):
 *
 *  - `connected`:   the acting user has an active connection — use it.
 *  - `connectable`: a real toolkit with no connection yet — OFFER to connect it
 *                   (request_connection).
 *  - `blocked`:     a real toolkit excluded by org/agent admin policy — tell the
 *                   user to ask their admin; never imply Houston lacks it, never
 *                   request_connection. Nothing in THIS repo produces `blocked`
 *                   today (the allowlist ceiling lives solely in the closed cloud
 *                   gateway); the enum + rendering + prompt exist now so a later
 *                   gateway change that annotates its search-proxy items with a
 *                   `status` lights it up here with zero further work.
 *  - `unknown`:     not a recognized toolkit.
 */
export const INTEGRATION_APP_STATUSES = [
  "connected",
  "connectable",
  "blocked",
  "unknown",
] as const;
export type IntegrationAppStatus = (typeof INTEGRATION_APP_STATUSES)[number];

/** Type guard for a value claimed to be an IntegrationAppStatus (wire input). */
export function isIntegrationAppStatus(v: unknown): v is IntegrationAppStatus {
  return (
    typeof v === "string" &&
    (INTEGRATION_APP_STATUSES as readonly string[]).includes(v)
  );
}

/**
 * Map the legacy `connected` boolean onto the status enum, the fallback when a
 * result carries no explicit `status`. A returned match that the user has not
 * connected is a real, connectable app (a genuine miss surfaces as an EMPTY
 * result, never a match) — so absent/false → connectable, true → connected.
 */
export function statusFromConnected(connected?: boolean): IntegrationAppStatus {
  return connected === true ? "connected" : "connectable";
}

/**
 * One result from search(): either an ACTION the agent could run, or a
 * toolkit-level entry (the app itself, no specific action — `action` is the
 * empty string) surfaced by catalog resolution so the model always learns the
 * slug to pass request_connection even when no action scored.
 */
export interface ToolMatch {
  /** The slug passed to execute(), e.g. "GMAIL_SEND_EMAIL". Empty ("") marks a
   *  toolkit-level entry (the app itself, no runnable action). */
  action: string;
  toolkit: string;
  description: string;
  /** JSON-schema-shaped description of the action's params, for the model. */
  inputParams?: unknown;
  /**
   * Whether the user has an active connection to this action's toolkit.
   * `false` means execute() would fail — the agent should offer the in-chat
   * connect card instead (HOU-670). Absent = unknown (older adapters). Retained
   * alongside `status` for backward compatibility (grants filter reads it).
   */
  connected?: boolean;
  /**
   * The app-level status driving the agent's speech act (see
   * IntegrationAppStatus). Every match the current adapters return carries it;
   * absent only from an older adapter, where the runtime derives it from
   * `connected`.
   */
  status?: IntegrationAppStatus;
  /**
   * Which registry provider produced this match. Stamped by the sandbox
   * search fan-out (never by adapters) so the runtime can route the follow-up
   * execute/connect to the right provider. Absent on single-provider hosts —
   * the runtime then omits it and the host falls back to its default.
   */
  provider?: string;
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
