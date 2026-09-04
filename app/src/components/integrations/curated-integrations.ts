import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type en from "../../locales/en/integrations.json";

/**
 * Hand-curated integrations: services we ship in the browse catalog even
 * though they are not in the Composio catalog — or whose Composio app we
 * want to pair with the service's OWN MCP sign-in. Each one is an MCP server
 * that Houston connects through the EXISTING custom-integration stack:
 * pressing Connect materializes a custom definition (`curatedAddInput`) and
 * then drives the stock sign-in / API-key flows, so the host needs no curated
 * concept at all. Committed data on purpose: the user never types a URL,
 * only picks how to sign in.
 */
export interface CuratedIntegration {
  /** The custom-definition slug this entry materializes as (CUSTOM_SLUG-safe).
   *  When it equals a Composio toolkit slug, the two are ONE card: Composio's
   *  connect leads the dialog and the MCP sign-in is its second option. */
  slug: string;
  name: string;
  /** The service's MCP endpoint (streamable HTTP). */
  endpoint: string;
  /** The BRAND site — feeds the host's icon derivation on the installed row. */
  website: string;
  categories: readonly string[];
  /** Which MCP connect options the service itself offers, lead option first. */
  authModes: readonly ("oauth" | "credential")[];
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

/** The `curated.<slug>.<leaf>` keys that EXIST in the en locale for a leaf:
 *  a curated slug without that copy is simply not assignable. (`t()` itself
 *  does not reject unknown keys at compile time; this is the guard.) */
type CuratedCopy = (typeof en)["curated"];
type CuratedCopyKey<Leaf extends string> = {
  [Slug in keyof CuratedCopy & string]: Leaf extends keyof CuratedCopy[Slug]
    ? `curated.${Slug}.${Leaf}`
    : never;
}[keyof CuratedCopy & string];

const CROMA: CuratedIntegration = {
  slug: "croma",
  name: "Croma",
  endpoint: "https://api.croma.run/mcp",
  website: "https://usecroma.com",
  categories: ["legal"],
  authModes: ["oauth", "credential"],
  signUpUrl: "https://platform.usecroma.com/sign-up",
  apiKeysUrl: "https://platform.usecroma.com",
  descriptionKey: "curated.croma.description",
  keyHelpKey: "curated.croma.keyHelp",
};

/**
 * HighLevel (GoHighLevel) through its official LeadConnector MCP server,
 * paired with Composio's `highlevel` app on deployments that have it. The
 * ORIGINAL `/mcp/` endpoint on purpose, not the per-client `/mcp/{client}/v2`
 * family the docs recommend: that family's OAuth registration only admits
 * clients HighLevel has allow-listed (`unrecognized_client` for anything
 * else, verified live), while `/mcp/` registers any client. Trailing slash
 * matters — it is the resource the server's OAuth metadata names. The
 * Private Integration Token stays as the third option because HighLevel's
 * own consent page currently refuses eight scopes its MCP app requests
 * (their bug, not steerable from our side), which sinks the browser sign-in
 * on at least some sub-accounts — the token is the path that works.
 */
const HIGHLEVEL: CuratedIntegration = {
  slug: "highlevel",
  name: "HighLevel",
  endpoint: "https://services.leadconnectorhq.com/mcp/",
  website: "https://www.gohighlevel.com",
  categories: ["crm", "marketing"],
  authModes: ["oauth", "credential"],
  signUpUrl: "https://www.gohighlevel.com/signup",
  apiKeysUrl: "https://app.gohighlevel.com",
  descriptionKey: "curated.highlevel.description",
  keyHelpKey: "curated.highlevel.keyHelp",
  keyTitleKey: "curated.highlevel.keyTitle",
  keyDescKey: "curated.highlevel.keyDesc",
  signInTitleKey: "curated.highlevel.signInTitle",
  signInDescKey: "curated.highlevel.signInDesc",
  providerTitleKey: "curated.highlevel.providerTitle",
  providerDescKey: "curated.highlevel.providerDesc",
};

export const CURATED_INTEGRATIONS: readonly CuratedIntegration[] = [
  CROMA,
  HIGHLEVEL,
];

export function curatedIntegrationOf(
  slug: string,
): CuratedIntegration | undefined {
  return CURATED_INTEGRATIONS.find((c) => c.slug === slug);
}

/**
 * The curated entries as browse-catalog toolkits, EXCLUDING any the user
 * already added (their row lives in the Installed strip, in whatever state) —
 * mirroring how a connected Composio app leaves "Available" — and any the
 * provider catalog already lists (that toolkit IS the card; the curated
 * dialog still opens for it). `describe` resolves the translated blurb where
 * `t()` lives and `logoOf` the bundled brand asset (`curated-logos.ts`,
 * Vite-only), keeping this module pure.
 */
export function curatedToolkits(
  custom: readonly CustomIntegrationView[],
  describe: (integration: CuratedIntegration) => string,
  logoOf: (slug: string) => string,
  providerCatalog: readonly IntegrationToolkit[] = [],
): IntegrationToolkit[] {
  const taken = new Set([
    ...custom.map((item) => item.slug),
    ...providerCatalog.map((tk) => tk.slug),
  ]);
  return CURATED_INTEGRATIONS.filter((c) => !taken.has(c.slug)).map((c) => ({
    slug: c.slug,
    name: c.name,
    description: describe(c),
    logoUrl: logoOf(c.slug),
    categories: [...c.categories],
  }));
}

/**
 * The browse catalog once a curated entry's MCP definition exists: the
 * provider's same-slug toolkit leaves "Available" exactly as a connected app
 * would, because the Installed strip already shows that service.
 */
export function withoutAddedCurated(
  catalog: readonly IntegrationToolkit[],
  custom: readonly CustomIntegrationView[],
): IntegrationToolkit[] {
  const added = new Set(custom.map((item) => item.slug));
  return catalog.filter(
    (tk) => !(added.has(tk.slug) && curatedIntegrationOf(tk.slug)),
  );
}

/**
 * The add-input that materializes one curated entry in the chosen auth mode.
 * `replace: true` makes connect idempotent: a leftover half-connected
 * definition (closed browser mid-sign-in, a concurrent add from chat) is
 * repaired in place instead of 409ing, and the host's service-origin check
 * still guards any stored credential.
 */
export function curatedAddInput(
  curated: CuratedIntegration,
  auth: "oauth" | "credential",
): AddCustomIntegrationInput {
  return {
    kind: "mcp",
    name: curated.name,
    endpoint: curated.endpoint,
    website: curated.website,
    auth,
    slug: curated.slug,
    replace: true,
  };
}
