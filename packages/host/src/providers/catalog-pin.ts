import { spokenModelRows } from "@houston/domain";
import type { CatalogProvider } from "@houston/protocol";
import { hostProvider, isKnownProvider } from "./lookup";

/**
 * Stamp a catalog provider with what the host's `start_mission` pin
 * resolution reads for it (routes/missions-provider.ts): the curated name its
 * `catalogFor` lists, and the spoken-name rows `resolveMissionModel` matches.
 * The hosted gateway serves this catalog and resolves a sleeping agent's
 * mission pin from it, so both read the host's own tables. A provider the
 * resolver does not know carries no pin.
 */
export function withMissionPin(provider: CatalogProvider): CatalogProvider {
  if (!isKnownProvider(provider.id)) return provider;
  const name = hostProvider(provider.id)?.name;
  return {
    ...provider,
    pin: {
      ...(name ? { name } : {}),
      models: spokenModelRows(provider.id),
    },
  };
}
