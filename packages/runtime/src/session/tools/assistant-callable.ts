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

function isServedHere(name: string): boolean {
  return !readUnservedOperations().has(name);
}

export function callableOperations(
  catalog: AssistantCatalog,
): AssistantOperation[] {
  const unserved = readUnservedOperations();
  return catalog.operations.filter(
    (op) => isCallableOperation(op) && !unserved.has(op.name),
  );
}

export function findCallableOperation(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperation | undefined {
  const op = findVisibleOperation(catalog, name);
  return op && isCallableOperation(op) && isServedHere(op.name)
    ? op
    : undefined;
}

export function refusedUnavailableHere(
  catalog: AssistantCatalog,
  name: string,
): AssistantOperationResult | null {
  const op = findVisibleOperation(catalog, name);
  if (!op || !isCallableOperation(op) || isServedHere(op.name)) return null;
  return assistantErrorResult(name, {
    code: ASSISTANT_UNAVAILABLE_HERE,
    message: `${name} is not available here. Do not retry it - tell the user plainly that it cannot be done here, and search houston_capabilities for something you can do instead.`,
  });
}
