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
 * exists (state `pending` until `credential` is stored). Decided at add time
 * from the service's declared auth + the user's answer, and persisted so a
 * restart re-creates the same connection shape.
 */
export type CustomAuthMode = "none" | "credential";

/** One user-defined integration, the unit of persistence. `slug` is the
 *  executor catalog slug AND the Houston toolkit slug (grants, UI, search). */
export type CustomIntegrationDef =
  | {
      kind: "openapi";
      slug: string;
      name: string;
      spec: CustomSpecSource;
      baseUrl?: string;
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

/** What the routes/UI list: the definition + its live state. */
export interface CustomIntegrationView {
  slug: string;
  name: string;
  kind: CustomIntegrationDef["kind"];
  /** The service URL shown to the user (spec url / MCP endpoint). */
  displayUrl?: string;
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
      | "compile_failed",
    message: string,
  ) {
    super(message);
    this.name = "CustomIntegrationError";
  }
}
