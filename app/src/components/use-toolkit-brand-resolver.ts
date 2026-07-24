import { type ChatInteractionBrand, prettifyToolkit } from "@houston-ai/chat";
import { useCallback } from "react";
import {
  findCatalogToolkit,
  normalizeToolkitSlug,
} from "./integration-connect-card-state";
import { appDisplay, useReadyToolkitCatalog } from "./integrations";

/**
 * A read-only resolver from a toolkit slug to its presentational brand (name +
 * logo) for a branded question card — the counterpart to `useIntegrationConnect`
 * with NO connect side effects, so a question that concerns an integration can
 * SHOW the app's identity without ever starting OAuth.
 *
 * Returns a stable function so the chat panel can map every branded question
 * step's `toolkit` in one place: a catalog HIT yields the real name + logo (held
 * back until the catalog settles so a favicon guess never flashes a 404); a MISS
 * yields the prettified slug and NO logo — never the raw "gmail" string, never a
 * crash. `undefined` when there is no toolkit to resolve.
 */
export function useToolkitBrandResolver(): (
  toolkit: string | undefined,
) => ChatInteractionBrand | undefined {
  const catalog = useReadyToolkitCatalog();
  const data = catalog.data;
  const isFetched = catalog.isFetched;
  return useCallback(
    (toolkit) => {
      if (!toolkit) return undefined;
      const slug = normalizeToolkitSlug(toolkit);
      const found = findCatalogToolkit(data, toolkit);
      const resolved = appDisplay(slug, found);
      return {
        name: found ? resolved.name : prettifyToolkit(toolkit),
        // Only a resolved catalog entry carries a logo, and only once the
        // catalog has settled; a miss shows the name alone.
        logoUrl: found && isFetched ? resolved.logoUrl : undefined,
      };
    },
    [data, isFetched],
  );
}
