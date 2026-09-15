// Reached by its published subpath rather than as a sibling: the catalog
// GENERATOR imports this module under `node --experimental-strip-types`, which
// resolves no extensionless relative specifier, and domain EMITS (so
// `allowImportingTsExtensions` is not available to it either).
import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import {
  ASSISTANT_HANDS_TOOLS,
  type AssistantHandsTool,
} from "@houston/domain/assistant-hands";
import type { AssistantOperationDocument } from "./assistant-catalog-types";

/**
 * How the coordinator's CAPABILITY INDEX is written — one line per catalog
 * group, naming the operations in it.
 *
 * It lives in domain rather than in the generator because it is rendered
 * TWICE from the same rule: once at generation time into
 * `assistant-capability-index.generated.ts`, and once at runtime over the
 * subset this deployment actually serves (a desktop has no spaces, no teams,
 * no billing). Two renderers would drift the day a line's wording changed, and
 * the drift would show up as an assistant promising the user an action its own
 * host cannot address.
 */

/** Everything the index needs of an operation, and nothing more. */
export type IndexOperation = Pick<
  AssistantOperationDocument,
  "name" | "group" | "hidden" | "route" | "hands"
>;

/**
 * What each card is FOR, in the user's words rather than the catalog's.
 *
 * The index names the four cards so the model knows the errands exist at all —
 * the operations behind them are hidden, so no group line ever mentions them.
 * Naming a tool alone teaches nothing, so each one carries the plain-language
 * errand it runs; keyed by tool, so dropping a card from
 * {@link ASSISTANT_HANDS_TOOLS} is a type error here rather than a sentence
 * that outlives it.
 */
const HANDS_ERRANDS: Readonly<Record<AssistantHandsTool, string>> = {
  request_connection: "connecting an app",
  request_credential: "giving an app its own key",
  request_hands_on: "billing, one-time keys and files on their device",
  request_provider_connection: "signing in to an AI provider",
};

/** The cards this set of operations actually reaches, in a stable order. */
function handsCards(
  operations: readonly IndexOperation[],
): readonly AssistantHandsTool[] {
  const reached = new Set(
    operations.flatMap((operation) =>
      operation.hands?.kind === "card" ? [operation.hands.tool] : [],
    ),
  );
  return ASSISTANT_HANDS_TOOLS.filter((tool) => reached.has(tool)).sort();
}

/** `a, b or c` — the last one joined by a word, the way a person reads a list. */
function orList(items: readonly string[]): string {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`
    : (items[0] ?? "");
}

/**
 * The index for `operations`, in the order they were given: group order is
 * first appearance, and a group whose operations all drop disappears with
 * them.
 *
 * It lists exactly what `houston_call` will PERFORM ({@link
 * isCallableOperation}), never merely what is visible — advertising an
 * operation this build refuses is how the agent comes to promise a user an
 * action it cannot deliver.
 */
export function renderAssistantCapabilityIndex(
  operations: readonly IndexOperation[],
): string {
  const callable = operations.filter(isCallableOperation);
  const groups = [...new Set(callable.map((operation) => operation.group))];
  const cards = handsCards(operations);
  return [
    "# What Houston can do",
    "",
    "Every action you can perform for the user, by area. This is the whole list: if something is not here, search houston_capabilities before you tell the user it cannot be done.",
    ...(cards.length
      ? [
          "",
          `Some things are the person's own to do and are not in this list: ${cards.map((tool) => HANDS_ERRANDS[tool]).join("; ")}. Hand those over with ${orList(cards)}.`,
        ]
      : []),
    "",
    ...groups.map(
      (group) =>
        `- ${group}: ${callable
          .filter((operation) => operation.group === group)
          .map((operation) => operation.name)
          .join(", ")}`,
    ),
    "",
    "Read one with houston_describe before you use it, then perform it with houston_call.",
  ].join("\n");
}
