import type { TFunction } from "i18next";

export interface CatalogCopy {
  name: string;
  description: string;
}

interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  author?: string;
}

export function localizeCatalogCopy(
  entry: CatalogEntry,
  t: TFunction,
): CatalogCopy {
  if (entry.author !== "Houston") {
    return { name: entry.name, description: entry.description };
  }
  return {
    name: t(`agents:catalog.${entry.id}.name`, { defaultValue: entry.name }),
    description: t(`agents:catalog.${entry.id}.description`, {
      defaultValue: entry.description,
    }),
  };
}
