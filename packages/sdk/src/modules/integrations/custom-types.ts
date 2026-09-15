/**
 * Custom integrations (HOU-550): user-added API / MCP servers that Composio
 * does not offer. The host owns persistence and compiles them to agent tools;
 * a client only lists them, removes them, and provides a secret for the ones
 * waiting on a credential. The secret crosses ONLY on the credential POST
 * body, never the chat transcript.
 */

/** One credential input to collect, keyed by `variable` in the submit body. */
export interface CustomAuthField {
  variable: string;
  label: string;
}

/** An auth method the integration declares; one password field per `fields`. */
export interface CustomAuthMethod {
  template: string;
  label: string;
  fields: CustomAuthField[];
}

/** Live status of a custom integration inside the running host. */
export type CustomIntegrationState =
  | { status: "active"; toolCount: number }
  | { status: "pending"; authMethods: CustomAuthMethod[] }
  | { status: "error"; message: string };

/** One compiled tool behind a custom integration, as the detail card lists
 *  it (name + blurb; addresses/schemas stay host-internal). */
export interface CustomToolInfo {
  name: string;
  description?: string;
}

/** What a pasted URL turned out to be — the manual add form's pre-check.
 *  `unknown` is a RESULT (not a recognizable service URL), never an error. */
export interface CustomDetectResult {
  kind: "openapi" | "mcp" | "unknown";
  name?: string;
  suggestedSlug?: string;
  /** MCP probe: does the server demand auth before listing tools? */
  requiresAuthentication?: boolean;
  /** MCP probe: the auth is the server's OWN sign-in flow (OAuth) — a pasted
   *  API key will never work; the browser sign-in is the path (when
   *  `oauthSupported`). */
  requiresOAuth?: boolean;
  /** Present with `requiresOAuth`: whether THIS deployment can run the
   *  browser sign-in (PRODUCT-1172). */
  oauthSupported?: boolean;
  toolCount?: number;
}

/**
 * The manual add form's submit body (HOU-980) — the SAME grammar the agent's
 * sandbox add tool sends, validated by the one host-side parser. `openapi`
 * needs `url` OR `spec` (an inline OpenAPI document); `mcp` needs `endpoint`.
 */
export type AddCustomIntegrationInput =
  | {
      kind: "openapi";
      name: string;
      url?: string;
      spec?: string;
      baseUrl?: string;
      /** The service's main website — the brand domain the card icon
       *  derives from (the endpoint often lives elsewhere). */
      website?: string;
      auth: "none" | "credential";
      slug?: string;
      /** Same-slug, same-kind adds become an in-place replace instead of a
       *  409 — the idempotent "ensure this definition exists" form (the
       *  curated catalog's connect). A stored credential survives only when
       *  the host proves the service origin is unchanged. */
      replace?: boolean;
    }
  | {
      kind: "mcp";
      name: string;
      endpoint: string;
      website?: string;
      /** Static, NON-secret request headers the server needs on every call
       *  (HighLevel's `locationId`). Secrets go through the credential save. */
      headers?: Record<string, string>;
      /** `oauth` (PRODUCT-1172): the server signs in with its own browser
       *  flow — the add lands `pending` until the user presses Sign in. */
      auth: "none" | "credential" | "oauth";
      slug?: string;
      /** See the openapi arm — the idempotent ensure-exists form. */
      replace?: boolean;
    };

/** What the host lists: the definition plus its live compiled state. */
export interface CustomIntegrationView {
  slug: string;
  name: string;
  website?: string;
  kind: "openapi" | "mcp";
  /** How this integration authenticates — `oauth` turns the pending state's
   *  affordance into Sign in (browser flow) instead of Enter key. Optional:
   *  an older host omits it (treat as key-based). */
  auth?: "none" | "credential" | "oauth";
  /** The service URL shown to the user (spec url / MCP endpoint). */
  displayUrl?: string;
  /** Favicon of the service the definition talks to; absent when none can
   *  exist (IP/localhost endpoints, unparseable blob specs). */
  iconUrl?: string;
  addedAtMs: number;
  state: CustomIntegrationState;
  /** Present when a credential can be (re)provided — the fields to collect. */
  authMethods?: CustomAuthMethod[];
  /** Only on the credential POST's response: the advisory health-check verdict
   *  for the just-saved key (true = confirmed, false = probe rejected but the
   *  key SAVED, absent = the service declares no probe). */
  verified?: boolean;
}

/** The cosmetic fields the detail card's edit form rewrites. */
export interface CustomIntegrationDetails {
  name: string;
  website: string;
}
