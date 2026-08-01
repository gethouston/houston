import { CatalogEmpty as SharedCatalogEmpty } from "@houston-ai/store";
import { agentSchemaUrl } from "@/lib/store-api-types";

/**
 * The deliberate pre-launch empty state for the home grid. The catalog starts
 * sparse, so instead of an apology this invites the first publishers and shows
 * both routes to get there.
 */
export function CatalogEmpty() {
  return (
    <SharedCatalogEmpty
      publishHref="https://gethouston.ai"
      apiHref={agentSchemaUrl()}
    />
  );
}
