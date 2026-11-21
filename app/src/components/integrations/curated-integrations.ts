import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { CURATED_INTEGRATIONS } from "./curated-entries.ts";
import type { CuratedAuthMode, CuratedIntegration } from "./curated-entry.ts";

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

export function withoutAddedCurated(
  catalog: readonly IntegrationToolkit[],
  custom: readonly CustomIntegrationView[],
): IntegrationToolkit[] {
  const added = new Set(custom.map((item) => item.slug));
  return catalog.filter(
    (tk) => !(added.has(tk.slug) && curatedIntegrationOf(tk.slug)),
  );
}

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
