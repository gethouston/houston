import { CatalogEmpty as SharedCatalogEmpty } from "@houston-ai/store";
import { agentSchemaUrl } from "@/lib/store-api-types";

export function CatalogEmpty() {
  return (
    <SharedCatalogEmpty
      publishHref="https://gethouston.ai"
      apiHref={agentSchemaUrl()}
    />
  );
}
