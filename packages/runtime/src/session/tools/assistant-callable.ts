import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import {
  ASSISTANT_UNAVAILABLE_HERE,
  readUnservedOperations,
} from "@houston/domain/assistant-deployment";
import type {
  AssistantCatalog,
  AssistantOperation,
} from "@houston/host/src/assistant/catalog";
import { findVisibleOperation } from "@houston/host/src/assistant/catalog";
import {
  type AssistantOperationResult,
  assistantErrorResult,
} from "./assistant-result";

/**
 * The catalog queries the assistant family asks: which operations the agent may
 * offer at all, and one of them by name. Whether an operation is offerable is
 * {@link isCallableOperation}, declared beside the catalog's wire shape so the
 * generator that writes the coordinator's capability index applies the same
 * rule these tools do — and then WHETHER THIS DEPLOYMENT SERVES IT, which the
 * catalog cannot say because it describes desktop and hosted cloud at once.
 *
 * The environment is read per query rather than memoised: it is a few hundred
 * bytes, it is read a handful of times a turn, and a module-level cache would
 * have to be reachable from tests to be exercised at all.
 */

/** False when the host that spawned this runtime told us it cannot perform it. */
function isServedHere(name: string): boolean {
  return !readUnservedOperations().has(name);
}

/** Every operation the agent may see and perform. */
export function callableOperations(
  catalog: AssistantCatalog,
): AssistantOperation[] {
  const unserved = readUnservedOperations();
  return catalog.operations.filter(
    (op) => isCallableOperation(op) && !unserved.has(op.name),
  );
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
  return op && isCallableOperation(op) && isServedHere(op.name)
    ? op
    : undefined;
}

/**
 * The refusal for an operation the CATALOG offers but this deployment cannot
 * perform, or null when that is not what happened.
 *
 * It answers only for an operation that is otherwise visible and routable, so
 * a withheld one still reads as "there is no such operation": the hidden set
 * stays indistinguishable from what does not exist, and the model learns
 * nothing from asking.
 *
 * Refusing HERE rather than letting the host answer saves a round trip and,
 * more importantly, says the one thing that stops the loop — this cannot be
 * done in this Houston, so stop retrying and tell the person.
 */
export function refusedUnavailableHere(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperationResult | null {
  const op = findVisibleOperation(catalog, name);
  if (!op || !isCallableOperation(op) || isServedHere(op.name)) return null;
  return assistantErrorResult(name, {
    code: ASSISTANT_UNAVAILABLE_HERE,
    message: `${name} is not available in this Houston. Do not retry it - tell the user plainly that it cannot be done here, and search houston_capabilities for something you can do instead.`,
  });
}
