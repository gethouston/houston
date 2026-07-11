/**
 * Lazy loader for a built-in agent template's heavy payload — its CLAUDE.md
 * plus the flat `relativePath → contents` seed map (skills, seeded `.houston`
 * data, working files) generated into `./store-templates/<id>.json` by
 * `scripts/gen-agent-templates.mjs`.
 *
 * The light picker cards live in `./store-catalog.ts` and ship in the initial
 * bundle; each template's ~100–270 KB payload is code-split into its own chunk
 * and fetched only when the user actually creates that agent. Kept out of
 * `store-catalog.ts` (and thus the built-in catalog module graph) so the
 * `import.meta.glob` call never reaches the Node test runner.
 */

export interface StoreTemplate {
  /** CLAUDE.md instructions, or undefined if the template ships none. */
  claudeMd?: string;
  /** Flat `relativePath → contents` map seeded under the new agent's root. */
  seeds: Record<string, string>;
  /**
   * English→locale skill slug renames (locale variants only). The locale
   * migration uses this to swap an already-seeded agent's unedited English
   * store skills for their translated versions.
   */
  skillRenames?: Record<string, string>;
}

// Eagerly globbed at build time (paths are static), lazily imported at runtime.
const loaders = import.meta.glob<{ default: StoreTemplate }>(
  "./store-templates/*.json",
);

/**
 * Load a template payload by id, or throw if the id is unknown.
 *
 * `locale` (a BCP-47 tag; the base language is what matters) picks the
 * translated variant (`<id>.es.json` / `<id>.pt.json`) when one exists, so a
 * Spanish workspace seeds Spanish skills. English — or a locale without a
 * variant — falls back to the base payload.
 */
export async function loadStoreTemplate(
  id: string,
  locale?: string,
): Promise<StoreTemplate> {
  const base = locale?.toLowerCase().split("-")[0];
  if (base && base !== "en") {
    const localized = loaders[`./store-templates/${id}.${base}.json`];
    if (localized) return (await localized()).default;
  }
  const loader = loaders[`./store-templates/${id}.json`];
  if (!loader) throw new Error(`unknown store template: ${id}`);
  return (await loader()).default;
}
