import type { AssistantOperationDocument } from "./assistant-catalog-types";

export function isCallableOperation(
  operation: Pick<AssistantOperationDocument, "hidden" | "route">,
): boolean {
  return !operation.hidden && operation.route !== null;
}
