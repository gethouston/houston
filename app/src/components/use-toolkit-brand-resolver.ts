import type { ChatInteractionBrand } from "@houston-ai/chat";
import { useCallback } from "react";
import { findCatalogToolkit } from "./integration-connect-card-state";
import { appDisplay, useReadyToolkitCatalog } from "./integrations";

export function useToolkitBrandResolver(): (
  toolkit: string | undefined,
) => ChatInteractionBrand | undefined {
  const catalog = useReadyToolkitCatalog();
  const data = catalog.data;
  const isFetched = catalog.isFetched;
  return useCallback(
    (toolkit) => {
      if (!toolkit) return undefined;
      const found = findCatalogToolkit(data, toolkit);
      const resolved = appDisplay(toolkit, found);
      return {
        name: resolved.name,
        logoUrl: found && isFetched ? resolved.logoUrl : undefined,
      };
    },
    [data, isFetched],
  );
}
