import type {
  AssistantCatalogDocument,
  AssistantOperationDocument,
  AssistantParameterDocument,
} from "@houston/domain";
import type { TSchema } from "typebox";

/**
 * The host's reading of the generated assistant operation catalog — one entry
 * per user-facing Houston operation (a function carrying an `@assistant` JSDoc
 * tag anywhere in the live client surface: `packages/web/src/engine-adapter`
 * plus the SDK's REST modules under `packages/sdk/src/modules`), emitted to
 * `./assistant-catalog.generated.json` by `pnpm gen:assistant-catalog` and
 * embedded at build time.
 *
 * The catalog is DATA, not code: the runtime describes operations to the model
 * from it and the host's dispatcher turns them into gateway requests from it,
 * so a newly annotated operation ships by regenerating the file — never by
 * adding a tool or a routing-table entry.
 *
 * It is read here because the host is the lower package: the runtime depends on
 * `@houston/host`, never the reverse.
 *
 * Every shape below is the ONE declaration in `@houston/domain`, the same one
 * the generator writes against, narrowed to the representation this side uses:
 * a parameter's schema arrives as arbitrary JSON Schema and is read back as a
 * typebox `TSchema`, because that is what `Value.Check` takes.
 */

export {
  ASSISTANT_CATALOG_VERSION,
  type AssistantHttpMethod,
  type AssistantPathEncoding,
  type AssistantPathParam,
  type AssistantRouteDocument as AssistantRoute,
} from "@houston/domain";

export type AssistantOperationParam = AssistantParameterDocument<TSchema>;
export type AssistantOperation = AssistantOperationDocument<TSchema>;
export type AssistantCatalog = AssistantCatalogDocument<TSchema>;
