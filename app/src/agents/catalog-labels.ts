import type { TFunction } from "i18next";

export interface CatalogCopy {
  name: string;
  description: string;
}

/**
 * The minimal shape both an `AgentConfig` (builtin / installed agents) and a
 * `StoreListing` (remote store catalog) satisfy — enough to localize a card.
 */
interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  author?: string;
}

/**
 * Localized display name + description for a new-agent store card.
 *
 * Houston's own first-party agents (`author === "Houston"`) — whether the
 * builtin `personal-assistant` / `blank` or a bundled store listing
 * (bookkeeping, legal, sales, …) — ship translations under
 * `agents:catalog.<id>`, so the store renders them in the user's language.
 *
 * Third-party / community agents keep their author's language (the App Store
 * model), so anything not authored by Houston falls back to the raw strings.
 * The `defaultValue` guard also covers a first-party agent that doesn't yet
 * have a `catalog.<id>` entry: it renders the in-catalog English rather than a
 * raw key.
 */
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
