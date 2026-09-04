import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type en from "../../locales/en/integrations.json";

/**
 * Hand-curated integrations: services we ship in the browse catalog even
 * though they are not in the Composio catalog. Each one is an MCP server that
 * Houston connects through the EXISTING custom-integration stack — pressing
 * Connect materializes a custom definition (`curatedAddInput`) and then drives
 * the stock sign-in / API-key flows, so the host needs no curated concept at
 * all. Committed data on purpose: the user never types a URL, only picks how
 * to sign in.
 */
export interface CuratedIntegration {
  /** The custom-definition slug this entry materializes as (CUSTOM_SLUG-safe). */
  slug: string;
  name: string;
  /** The service's MCP endpoint (streamable HTTP). */
  endpoint: string;
  /** The BRAND site — feeds the host's icon derivation on the installed row. */
  website: string;
  categories: readonly string[];
  /** Which connect options the service itself offers, lead option first. */
  authModes: readonly ["oauth", "credential"];
  /** Where a new user registers, and where an existing user copies a key. */
  signUpUrl: string;
  apiKeysUrl: string;
  /** i18n keys (integrations namespace) for the per-service copy, typed
   *  from the en locale so a key without copy fails to compile. */
  descriptionKey: CuratedCopyKey<"description">;
  keyHelpKey: CuratedCopyKey<"keyHelp">;
  /** Optional note under the sign-in choice, for services whose consent page
   *  wears a name the user would not recognize (HighLevel's says
   *  "LeadConnector") — without it a non-technical user closes the browser
   *  thinking they landed on the wrong site. */
  signInNoteKey?: CuratedCopyKey<"signInNote">;
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
 * HighLevel (GoHighLevel) through its official LeadConnector MCP server. The
 * ORIGINAL `/mcp/` endpoint on purpose, not the per-client `/mcp/{client}/v2`
 * family the docs recommend: that family's OAuth registration only admits
 * clients HighLevel has allow-listed (`unrecognized_client` for anything
 * else, verified live), while `/mcp/` registers any client and serves both
 * browser sign-in and Private Integration Tokens. Trailing slash matters —
 * it is the resource the server's OAuth metadata names. Each connection is
 * one sub-account (location), chosen on the consent page or by the token.
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
  signInNoteKey: "curated.highlevel.signInNote",
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
 * mirroring how a connected Composio app leaves "Available". `describe`
 * resolves the translated blurb where `t()` lives and `logoOf` the bundled
 * brand asset (`curated-logos.ts`, Vite-only), keeping this module pure.
 */
export function curatedToolkits(
  custom: readonly CustomIntegrationView[],
  describe: (integration: CuratedIntegration) => string,
  logoOf: (slug: string) => string,
): IntegrationToolkit[] {
  const added = new Set(custom.map((item) => item.slug));
  return CURATED_INTEGRATIONS.filter((c) => !added.has(c.slug)).map((c) => ({
    slug: c.slug,
    name: c.name,
    description: describe(c),
    logoUrl: logoOf(c.slug),
    categories: [...c.categories],
  }));
}

/**
 * The provider (Composio) catalog with every toolkit a curated entry claims
 * REMOVED — the curated entry is the one way to connect that service, on
 * every deployment. Composio lists "highlevel" too: without this, a cloud
 * catalog showed two HighLevel cards under one slug (duplicate React keys,
 * and a Connect that opened the curated dialog from either), and a Composio
 * search row could offer a connection the card would never make.
 */
export function withoutCuratedDuplicates(
  catalog: readonly IntegrationToolkit[],
): IntegrationToolkit[] {
  return catalog.filter((tk) => curatedIntegrationOf(tk.slug) === undefined);
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
