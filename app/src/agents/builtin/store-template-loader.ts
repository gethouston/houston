export interface StoreTemplate {
  claudeMd?: string;
  seeds: Record<string, string>;
  skillRenames?: Record<string, string>;
}

const loaders = import.meta.glob<{ default: StoreTemplate }>(
  "./store-templates/*.json",
);

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
