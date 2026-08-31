import cromaIcon from "../../assets/integrations/croma.svg";

/**
 * Bundled brand icons for the curated catalog entries. Committed assets, not
 * remote favicon lookups: a curated card must ALWAYS show its brand mark, and
 * both remote paths fail in real deployments (the generic fallback guesses
 * `<slug>.com` — the wrong site for Croma — and favicon proxies can be
 * blocked/offline). Split from `curated-integrations.ts` because asset
 * imports are Vite-only and the pure module runs under `node --test`.
 */
const CURATED_LOGOS: Readonly<Record<string, string>> = {
  croma: cromaIcon,
};

/** The bundled logo URL for a curated slug, or "" for a non-curated one
 *  (AppLogo's letter avatar takes over). */
export function curatedLogoUrl(slug: string): string {
  return CURATED_LOGOS[slug] ?? "";
}

/** The icon for a CUSTOM integration view: the bundled curated asset when the
 *  slug is one of ours, else the host-derived favicon (may be absent). */
export function customIntegrationLogoUrl(
  slug: string,
  iconUrl: string | undefined,
): string {
  return curatedLogoUrl(slug) || iconUrl || "";
}
