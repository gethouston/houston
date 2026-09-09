import type en from "../../locales/en/integrations.json";

/**
 * The shape of one hand-curated integration: a service we ship in the browse
 * catalog even though it is not in the Composio catalog, or whose Composio
 * app we want to pair with the service's OWN connect path. Each rides the
 * EXISTING custom-integration stack: pressing Connect materializes a custom
 * definition (`curatedAddInput`) and then drives the stock sign-in / API-key
 * flows, so the host needs no curated concept at all. Committed data on
 * purpose: the user never types a URL, only picks how to sign in.
 */
export interface CuratedIntegration {
  /** The custom-definition slug this entry materializes as (CUSTOM_SLUG-safe).
   *  When it equals a Composio toolkit slug, the two are ONE card: Composio's
   *  connect leads the dialog and the MCP sign-in is its second option. */
  slug: string;
  name: string;
  /** What the definition compiles from: the service's MCP endpoint, or a
   *  committed OpenAPI document over its REST API. */
  source: CuratedSource;
  /** The BRAND site — feeds the host's icon derivation on the installed row. */
  website: string;
  categories: readonly string[];
  /** Which connect options the service itself offers, lead option first. An
   *  OpenAPI source only ever offers `credential` (there is no server to run
   *  a browser sign-in against). */
  authModes: readonly CuratedAuthMode[];
  /** Where a new user registers, and where an existing user copies a key. */
  signUpUrl: string;
  apiKeysUrl: string;
  /** i18n keys (integrations namespace) for the per-service copy, typed
   *  from the en locale so a key without copy fails to compile. */
  descriptionKey: CuratedCopyKey<"description">;
  /** Required when `authModes` offers `credential` (pinned by the app test). */
  keyHelpKey?: CuratedCopyKey<"keyHelp">;
  /** Per-service wording for the key option when the service does not call
   *  it an API key (HighLevel: a "private integration token"). */
  keyTitleKey?: CuratedCopyKey<"keyTitle">;
  keyDescKey?: CuratedCopyKey<"keyDesc">;
  /** A NON-secret value the server wants as a static header on every call,
   *  collected next to the key (HighLevel's `locationId`, the sub-account).
   *  Stored on the definition, never in the vault. MCP sources only. */
  extraHeader?: {
    name: string;
    labelKey: CuratedCopyKey<"headerLabel">;
    helpKey: CuratedCopyKey<"headerHelp">;
  };
  /** Per-service wording for the MCP sign-in option, when the generic
   *  "Sign in with {{name}}" would not tell it apart from the provider's own
   *  connect (HighLevel's consent page says "LeadConnector"). */
  signInTitleKey?: CuratedCopyKey<"signInTitle">;
  signInDescKey?: CuratedCopyKey<"signInDesc">;
  /** Wording for the provider (Composio) connect option the dialog offers
   *  under the MCP sign-in whenever the deployment's catalog carries this
   *  slug. */
  providerTitleKey?: CuratedCopyKey<"providerTitle">;
  providerDescKey?: CuratedCopyKey<"providerDesc">;
}

export type CuratedAuthMode = "oauth" | "credential";

export type CuratedSource =
  | {
      kind: "mcp";
      /** The service's MCP endpoint (streamable HTTP). */
      endpoint: string;
    }
  | {
      kind: "openapi";
      /** The OpenAPI document as JSON text — committed, never fetched, so the
       *  tool names and wording the agent sees are ours to keep readable. */
      spec: string;
      /** The API host every path resolves against. */
      baseUrl: string;
    };

/** The `curated.<slug>.<leaf>` keys that EXIST in the en locale for a leaf:
 *  a curated slug without that copy is simply not assignable. (`t()` itself
 *  does not reject unknown keys at compile time; this is the guard.) */
type CuratedCopy = (typeof en)["curated"];
export type CuratedCopyKey<Leaf extends string> = {
  [Slug in keyof CuratedCopy & string]: Leaf extends keyof CuratedCopy[Slug]
    ? `curated.${Slug}.${Leaf}`
    : never;
}[keyof CuratedCopy & string];
