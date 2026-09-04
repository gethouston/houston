/**
 * Custom integrations (HOU-550): user-added API/MCP sources that Composio does
 * not offer, compiled to agent tools by the embedded executor engine
 * (@executor-js/*). Houston owns persistence (definitions + secrets); the
 * executor is an in-memory compiled view rebuilt from these definitions, so no
 * pre-1.0 executor storage schema ever becomes a Houston data format.
 */

/** Where an OpenAPI document comes from: a URL we can re-fetch, or an inline
 *  body (pasted / file-provided) that never needs the network again. */
export type CustomSpecSource =
  | { kind: "url"; url: string }
  | { kind: "blob"; value: string };

/** The stored credential routing for one integration: which auth template the
 *  connection renders through, and the secret-store id per template variable.
 *  Secret VALUES live only in the secret store, never in definitions. */
export interface CustomCredentialRef {
  template: string;
  secretIds: Record<string, string>;
}

/**
 * How the integration authenticates: `none` connects immediately (public API /
 * open MCP server); `credential` waits for the user's secret before any tool
 * exists (state `pending` until `credential` is stored); `oauth` (MCP only,
 * PRODUCT-1172) waits for the user to sign in through the service's own
 * browser flow — the stored `credential` then references the token bundle
 * (`oauth-bundle.ts`) instead of a pasted key. Decided at add time from the
 * service's declared auth + the user's answer, and persisted so a restart
 * re-creates the same connection shape.
 */
export type CustomAuthMode = "none" | "credential" | "oauth";

/** One user-defined integration, the unit of persistence. `slug` is the
 *  executor catalog slug AND the Houston toolkit slug (grants, UI, search). */
export type CustomIntegrationDef =
  | {
      kind: "openapi";
      slug: string;
      name: string;
      spec: CustomSpecSource;
      baseUrl?: string;
      /** The service's main website (PRODUCT-1172): the BRAND domain the icon
       *  derives from — the technical endpoint often lives elsewhere (an MCP
       *  host, a raw spec URL) whose domain carries no favicon. Cosmetic
       *  only; never part of the service-origin security checks. */
      website?: string;
      auth: CustomAuthMode;
      addedAtMs: number;
      credential?: CustomCredentialRef;
    }
  | {
      kind: "mcp";
      slug: string;
      name: string;
      endpoint: string;
      /** Static non-secret headers (e.g. a tenant id); secrets go via credential. */
      headers?: Record<string, string>;
      /** Scopes the server ADVERTISES (`scopes_supported`) but its consent
       *  page rejects — HighLevel lists eight its own app refuses, and one
       *  refused scope fails the whole sign-in. Dropped from the request;
       *  everything else advertised is still asked for. */
      oauthScopeExclusions?: string[];
      /** See the openapi arm — the brand domain for the icon. */
      website?: string;
      auth: CustomAuthMode;
      addedAtMs: number;
      credential?: CustomCredentialRef;
    };

/** Executor slugs are slug-like; Houston grant slugs allow [a-z0-9_-]. Enforce
 *  the intersection so a custom slug is valid everywhere it travels. */
export const CUSTOM_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * One credential input the user must provide, derived from the integration's
 * declared auth method (executor `authMethods[].placements`). `variable` keys
 * the value in `connections.create({inputs})`; `label` is what the UI shows.
 */
export interface CustomAuthField {
  variable: string;
  label: string;
}

/** An auth method the integration declares (mirrors the executor's shape,
 *  reduced to what routes/UI need). `template` is what connect uses. */
export interface CustomAuthMethod {
  template: string;
  label: string;
  fields: CustomAuthField[];
}

/**
 * Live status of one definition inside the running executor:
 *  - `active`:  compiled, connected, tools available.
 *  - `pending`: added but waiting on a credential (no connection yet).
 *  - `error`:   failed to rehydrate/compile (spec unreachable, server down…).
 */
export type CustomIntegrationState =
  | { status: "active"; toolCount: number }
  | { status: "pending"; authMethods: CustomAuthMethod[] }
  | { status: "error"; message: string };

/** One compiled tool of a custom integration, reduced to what the detail
 *  UI lists (name + blurb). Addresses/schemas stay engine-internal. */
export interface CustomToolInfo {
  name: string;
  description?: string;
}

/** What the routes/UI list: the definition + its live state. */
export interface CustomIntegrationView {
  slug: string;
  name: string;
  kind: CustomIntegrationDef["kind"];
  /** How this integration authenticates — `oauth` turns the pending state's
   *  affordance into Sign in (browser flow) instead of Enter key. */
  auth: CustomAuthMode;
  /** The service URL shown to the user (spec url / MCP endpoint). */
  displayUrl?: string;
  /** Favicon of the service the definition talks to (PRODUCT-1172); absent
   *  when none can exist (IP/localhost endpoints, unparseable blob specs). */
  iconUrl?: string;
  addedAtMs: number;
  state: CustomIntegrationState;
  /** Present when a credential can be (re)provided — the fields to collect. */
  authMethods?: CustomAuthMethod[];
  /**
   * Only on the credential POST's response: the advisory health-check verdict
   * for the just-saved key. `true` = the service confirmed it; `false` = the
   * probe was rejected (the key still SAVED — the placement guess may simply
   * not fit this service, so the UI warns instead of blocking); absent = the
   * service declares no probe, no claim either way.
   */
  verified?: boolean;
}

/** Typed failure for management ops; routes map `code` onto stable JSON error
 *  bodies the runtime tools classify on (never bare status codes). */
export class CustomIntegrationError extends Error {
  constructor(
    readonly code:
      | "invalid_slug"
      | "duplicate_slug"
      | "not_found"
      | "unsupported_source"
      | "credential_invalid"
      | "compile_failed"
      | "oauth_unsupported"
      | "oauth_failed"
      | "oauth_state_invalid",
    message: string,
  ) {
    super(message);
    this.name = "CustomIntegrationError";
  }
}
