/**
 * The Models tab: a thin wrapper that hands the full catalog to the shared
 * `ModelsBrowser` (the "AI provider" / "Good at" / "Cost" / "Memory" facet
 * comboboxes above a card grid). Free-text search is the page's ONE search
 * field, threaded down as `query`; the facet state and filtering live in
 * `ModelsBrowser`, which the provider modal reuses (with its own search box)
 * so both surfaces read identically.
 */

import type { HubCatalog } from "../../lib/ai-hub/catalog-types.ts";
import { ModelsBrowser } from "./models-browser.tsx";

export function ModelDirectory({
  catalog,
  query,
  onOpenModel,
}: {
  catalog: HubCatalog;
  /** The page's single search query. */
  query: string;
  onOpenModel: (key: string) => void;
}) {
  return (
    <ModelsBrowser
      models={catalog.models}
      query={query}
      onOpenModel={onOpenModel}
      layout="grid"
      className="flex-1"
    />
  );
}
