import type { AssistantOperationDocument } from "./assistant-catalog-types";

/**
 * Which catalogued operations the assistant family may offer at all.
 *
 * Two separate facts withhold an operation and they must never drift apart, so
 * ONE predicate decides for every reader — the runtime's three tools
 * (`houston_capabilities` / `describe` / `call`) and the capability index the
 * coordinator carries in its prompt:
 *
 * - `hidden` — withheld by policy: never listed, described, or called.
 * - `route: null` — the generator could not derive an HTTP call conservatively,
 *   so the host's dispatcher refuses it (`operation_not_supported`). Listing or
 *   describing one would have the agent promise the user an action this build
 *   cannot perform, and the user hears the refusal as Houston breaking.
 */
export function isCallableOperation(
  operation: Pick<AssistantOperationDocument, "hidden" | "route">,
): boolean {
  return !operation.hidden && operation.route !== null;
}
