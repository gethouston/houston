import type { TFunction } from "i18next";
import type { AgentDefinition } from "../lib/types";

/**
 * Localized display name + description for a catalog agent shown in the
 * new-agent store.
 *
 * Houston's first-party (builtin) agents ship translations under
 * `agents:catalog.<id>`, so the store renders them in the user's language.
 * Installed / remote store agents keep their author's language (the App Store
 * model), so anything that isn't builtin falls back to the raw config strings.
 *
 * The `defaultValue` guard also covers a builtin agent that doesn't yet have a
 * `catalog.<id>` entry: it renders the in-code English rather than a raw key.
 */
export function localizeCatalogEntry(
  def: AgentDefinition,
  t: TFunction,
): { name: string; description: string } {
  const { config } = def;
  if (def.source !== "builtin") {
    return { name: config.name, description: config.description };
  }
  return {
    name: t(`agents:catalog.${config.id}.name`, { defaultValue: config.name }),
    description: t(`agents:catalog.${config.id}.description`, {
      defaultValue: config.description,
    }),
  };
}
