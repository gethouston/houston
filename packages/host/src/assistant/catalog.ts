import type { AssistantCatalog, AssistantOperation } from "./catalog-types";

export { parseAssistantCatalog } from "./catalog-parse";
export {
  ASSISTANT_CATALOG_VERSION,
  type AssistantCatalog,
  type AssistantHttpMethod,
  type AssistantOperation,
  type AssistantOperationParam,
  type AssistantPathEncoding,
  type AssistantPathParam,
  type AssistantRoute,
} from "./catalog-types";

export function visibleOperations(
  catalog: AssistantCatalog,
): AssistantOperation[] {
  return catalog.operations.filter((op) => !op.hidden);
}

export function findVisibleOperation(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperation | undefined {
  return catalog.operations.find((op) => op.name === name && !op.hidden);
}
