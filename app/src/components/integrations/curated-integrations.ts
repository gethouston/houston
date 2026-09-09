import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { CURATED_INTEGRATIONS } from "./curated-entries.ts";
import type { CuratedAuthMode, CuratedIntegration } from "./curated-entry.ts";

/**
 * The curated catalog's behavior: which entries show in Browse, how one
 * becomes a custom definition. The entries themselves live in
 * `curated-entries.ts`, their shape in `curated-entry.ts`; both are
 * re-exported here so every consumer keeps one import.
 */
export { CURATED_INTEGRATIONS } from "./curated-entries.ts";
export type {
  CuratedAuthMode,
  CuratedIntegration,
  CuratedSource,
} from "./curated-entry.ts";

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
 * The browse catalog once a curated entry's definition exists: the
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
 * still guards any stored credential. An OpenAPI source has no sign-in to
 * run, so it always lands in credential mode whatever was asked.
 */
export function curatedAddInput(
  curated: CuratedIntegration,
  auth: CuratedAuthMode,
  headers?: Record<string, string>,
): AddCustomIntegrationInput {
  const { source } = curated;
  if (source.kind === "openapi") {
    return {
      kind: "openapi",
      name: curated.name,
      spec: source.spec,
      baseUrl: source.baseUrl,
      website: curated.website,
      auth: "credential",
      slug: curated.slug,
      replace: true,
    };
  }
  return {
    kind: "mcp",
    name: curated.name,
    endpoint: source.endpoint,
    website: curated.website,
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    auth,
    slug: curated.slug,
    replace: true,
  };
}
