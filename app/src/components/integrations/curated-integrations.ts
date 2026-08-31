import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
  IntegrationToolkit,
} from "@houston-ai/engine-client";

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
  /** Explicit catalog logo: the brand domain often differs from `<slug>.com`,
   *  so the generic favicon fallback would fetch the wrong site's icon. */
  logoUrl: string;
  categories: readonly string[];
  /** Which connect options the service itself offers, lead option first. */
  authModes: readonly ["oauth", "credential"];
  /** Where a new user registers, and where an existing user copies a key. */
  signUpUrl: string;
  apiKeysUrl: string;
  /** Typed i18n keys (integrations namespace) for the per-service copy. */
  descriptionKey: "curated.croma.description";
  keyHelpKey: "curated.croma.keyHelp";
}

const CROMA: CuratedIntegration = {
  slug: "croma",
  name: "Croma",
  endpoint: "https://api.croma.run/mcp",
  website: "https://usecroma.com",
  logoUrl: "https://www.google.com/s2/favicons?domain=usecroma.com&sz=128",
  categories: ["legal"],
  authModes: ["oauth", "credential"],
  signUpUrl: "https://platform.usecroma.com/sign-up",
  apiKeysUrl: "https://platform.usecroma.com",
  descriptionKey: "curated.croma.description",
  keyHelpKey: "curated.croma.keyHelp",
};

export const CURATED_INTEGRATIONS: readonly CuratedIntegration[] = [CROMA];

export function curatedIntegrationOf(
  slug: string,
): CuratedIntegration | undefined {
  return CURATED_INTEGRATIONS.find((c) => c.slug === slug);
}

/**
 * The curated entries as browse-catalog toolkits, EXCLUDING any the user
 * already added (their row lives in the Installed strip, in whatever state) —
 * mirroring how a connected Composio app leaves "Available". `describe`
 * resolves the translated blurb where `t()` lives, keeping this module pure.
 */
export function curatedToolkits(
  custom: readonly CustomIntegrationView[],
  describe: (integration: CuratedIntegration) => string,
): IntegrationToolkit[] {
  const added = new Set(custom.map((item) => item.slug));
  return CURATED_INTEGRATIONS.filter((c) => !added.has(c.slug)).map((c) => ({
    slug: c.slug,
    name: c.name,
    description: describe(c),
    logoUrl: c.logoUrl,
    categories: [...c.categories],
  }));
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

/**
 * Where the connect dialog starts: the sign-in / key fork, unless this
 * deployment cannot run the browser sign-in at all
 * (`capabilities.customIntegrationOAuth` absent) — then the key form is the
 * only option and the fork would be a dead end.
 */
export function initialCuratedStep(oauthSupported: boolean): "choose" | "key" {
  return oauthSupported ? "choose" : "key";
}
