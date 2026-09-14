import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import type {
  AssistantCatalog,
  AssistantOperation,
} from "@houston/host/src/assistant/catalog";
import { findVisibleOperation } from "@houston/host/src/assistant/catalog";

/**
 * The catalog queries the assistant family asks: which operations the agent may
 * offer at all, and one of them by name. Whether an operation is offerable is
 * {@link isCallableOperation}, declared beside the catalog's wire shape so the
 * generator that writes the coordinator's capability index applies the same
 * rule these tools do.
 */

/** Every operation the agent may see and perform. */
export function callableOperations(
  catalog: AssistantCatalog,
): AssistantOperation[] {
  return catalog.operations.filter(isCallableOperation);
}

/**
 * One callable operation by exact name, or undefined. Withheld operations
 * resolve to undefined so the agent cannot tell "withheld" from "does not
 * exist" — neither set is a hint list.
 */
export function findCallableOperation(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperation | undefined {
  const op = findVisibleOperation(catalog, name);
  return op && isCallableOperation(op) ? op : undefined;
}
