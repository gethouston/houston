import type { AssistantCatalog, AssistantOperation } from "./catalog-types";

/**
 * The assistant operation catalog as the rest of the host uses it: the shapes
 * (`./catalog-types`), reading a document off disk (`./catalog-parse`), and the
 * two queries below. One import site for all three, because a caller that needs
 * an operation almost always needs the catalog's type too.
 */

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

/** Every operation the agent may see (hidden ones are withheld everywhere). */
export function visibleOperations(
  catalog: AssistantCatalog,
): AssistantOperation[] {
  return catalog.operations.filter((op) => !op.hidden);
}

/**
 * One operation by exact name, or undefined. A hidden operation resolves to
 * undefined so the agent cannot tell "withheld" from "does not exist" — the
 * hidden set is not a hint list.
 */
export function findVisibleOperation(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperation | undefined {
  return catalog.operations.find((op) => op.name === name && !op.hidden);
}
