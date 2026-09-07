import type {
  AssistantCatalog,
  AssistantOperation,
} from "@houston/host/src/assistant/catalog";
import { findVisibleOperation } from "@houston/host/src/assistant/catalog";

/**
 * Which catalogued operations the assistant family may offer at all.
 *
 * Two separate facts withhold an operation and they must never drift apart, so
 * ONE predicate decides for all three tools:
 *
 * - `hidden` — withheld by policy: never listed, described, or called.
 * - `route: null` — the generator could not derive an HTTP call conservatively,
 *   so the host's dispatcher refuses it (`operation_not_supported`). Listing or
 *   describing one would have the agent promise the user an action this build
 *   cannot perform, and the user hears the refusal as Houston breaking.
 */

/** True when the agent may see AND perform this operation. */
export function isCallableOperation(op: AssistantOperation): boolean {
  return !op.hidden && op.route !== null;
}

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
