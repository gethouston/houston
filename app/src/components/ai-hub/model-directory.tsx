/**
 * The Models tab: a thin wrapper that hands the full catalog to the shared
 * `ModelsBrowser` (search box + "AI provider" / "Good at" dropdowns + the
 * Mercury ledger). All filter state and filtering live in `ModelsBrowser`, which
 * the provider modal reuses so both surfaces read identically.
 */

import type { HubCatalog } from "../../lib/ai-hub/catalog-types.ts";
import { ModelsBrowser } from "./models-browser.tsx";

export function ModelDirectory({
  catalog,
  onOpenModel,
}: {
  catalog: HubCatalog;
  onOpenModel: (key: string) => void;
}) {
  return (
    <ModelsBrowser
      models={catalog.models}
      onOpenModel={onOpenModel}
      className="flex-1"
    />
  );
}
