import catalogDocument from "./assistant-catalog.generated.json" with {
  type: "json",
};
import {
  ASSISTANT_CATALOG_VERSION,
  type AssistantCatalog,
  parseAssistantCatalog,
} from "./catalog";

/**
 * The assistant operation catalog this PROCESS dispatches over, embedded at
 * build time. `pnpm gen:assistant-catalog` writes the JSON beside this module
 * and the import inlines it into every artifact carrying the host — the bundled
 * container entrypoint and the Bun-compiled desktop sidecar alike — so there is
 * no file to locate, no layout in which an installed build silently has nothing
 * to perform, and no way for the host's dispatcher and the runtime's assistant
 * tools to read two different catalogs.
 */

/**
 * Check one catalog document through the same envelope guard every document
 * passes. The document is re-serialised because that guard's contract is a
 * document rather than a shape-checked object: one validation path, run once
 * per process. A document that fails is a BROKEN BUILD — the family stays off,
 * loudly, and the callers turn that into "this host can perform nothing".
 */
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

/**
 * `null` is a real, cacheable answer (an embedded catalog that fails the guard),
 * so absence of the cache — not a null catalog — is what marks "not read yet".
 */
let cached: { catalog: AssistantCatalog | null } | undefined;

/**
 * The catalog this process dispatches over, read once. Called at boot so the
 * line naming what this build carries lands in the startup log rather than in
 * the first unlucky request.
 */
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
