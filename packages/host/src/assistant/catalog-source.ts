import catalogDocument from "./assistant-catalog.generated.json" with {
  type: "json",
};
import {
  ASSISTANT_CATALOG_VERSION,
  type AssistantCatalog,
  parseAssistantCatalog,
} from "./catalog";

export function readEmbeddedCatalog(
  document: unknown = catalogDocument,
  log: (message: string) => void = console.error,
): AssistantCatalog | null {
  const catalog = parseAssistantCatalog(JSON.stringify(document));
  if (!catalog) {
    log(
      `[assistant] off: the embedded operation catalog is malformed or not version ${ASSISTANT_CATALOG_VERSION}. Regenerate it with \`pnpm gen:assistant-catalog\`.`,
    );
  }
  return catalog;
}

let cached: { catalog: AssistantCatalog | null } | undefined;

export function processAssistantCatalog(): AssistantCatalog | null {
  if (!cached) {
    const catalog = readEmbeddedCatalog();
    if (catalog) {
      console.log(
        `[assistant] operation catalog: ${catalog.operations.length} operations (embedded, source ${catalog.sourceHash.slice(0, 12)})`,
      );
    }
    cached = { catalog };
  }
  return cached.catalog;
}
