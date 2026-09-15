// Reached by its published subpath rather than as a sibling: the catalog
// GENERATOR imports this module under `node --experimental-strip-types`, which
// resolves no extensionless relative specifier, and domain EMITS (so
// `allowImportingTsExtensions` is not available to it either).
import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import {
  ASSISTANT_HANDS_TOOLS,
  type AssistantHandsTool,
} from "@houston/domain/assistant-hands";
import {
  HANDS_ON_SURFACES,
  type HandsOnSurface,
} from "@houston/protocol/interaction-types";
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
 * The index names the cards so the model knows the errands exist at all — the
 * operations behind them are hidden, so no group line ever mentions them.
 * Naming a tool alone teaches nothing, so each one carries the plain-language
 * errand it runs; keyed by tool, so dropping a card from
 * {@link ASSISTANT_HANDS_TOOLS} is a type error here rather than a sentence
 * that outlives it.
 *
 * `request_hands_on` is absent because one phrase cannot answer for it: it
 * opens a NAMED screen, and which screens exist is a fact about the deployment
 * ({@link HANDS_ON_ERRANDS}).
 */
const HANDS_ERRANDS: Readonly<
  Record<Exclude<AssistantHandsTool, "request_hands_on">, string>
> = {
  request_connection: "connecting an app",
  request_credential: "giving an app its own key",
  request_provider_connection: "signing in to an AI provider",
};

/**
 * What each `request_hands_on` SCREEN is for, one fragment per surface.
 *
 * Per surface rather than one fixed phrase, because the card reaches only the
 * screens whose operations this deployment serves: a desktop has no billing
 * page and no key list, and a preamble that named them anyway would teach the
 * manager to send the person somewhere its own Houston cannot open — the exact
 * broken promise the unserved stamp exists to prevent. Keyed by
 * {@link HANDS_ON_SURFACES}, so teaching the app a new screen is a type error
 * here until this sentence knows how to say it.
 */
const HANDS_ON_ERRANDS: Readonly<Record<HandsOnSurface, string>> = {
  apiKeys: "one-time keys",
  billing: "billing",
  files: "files on their device",
  routineWebhook: "a routine's webhook",
  orgDanger: "destroying a shared space",
};

/** One card the index names: the tool, and the errand it runs in plain words. */
interface HandsCard {
  tool: AssistantHandsTool;
  errand: string;
}

/**
 * The cards this set of operations actually reaches.
 *
 * Order is {@link ASSISTANT_HANDS_TOOLS} declaration order, which is already
 * deterministic — no re-sort, so the sentence reads in the order the cards are
 * declared rather than alphabetically. `request_hands_on` drops out entirely
 * when none of its screens survive: a card with nothing to open is a tool the
 * model would reach for and find empty.
 */
function handsCards(
  operations: readonly IndexOperation[],
): readonly HandsCard[] {
  const cards = operations.flatMap((operation) =>
    operation.hands?.kind === "card" ? [operation.hands] : [],
  );
  const reached = new Set(cards.map((card) => card.tool));
  const screens = new Set(
    cards.flatMap((card) =>
      card.tool === "request_hands_on" && card.surface ? [card.surface] : [],
    ),
  );
  return ASSISTANT_HANDS_TOOLS.flatMap<HandsCard>((tool) => {
    if (!reached.has(tool)) return [];
    if (tool !== "request_hands_on")
      return [{ tool, errand: HANDS_ERRANDS[tool] }];
    const named = HANDS_ON_SURFACES.filter((surface) => screens.has(surface));
    return named.length > 0
      ? [
          {
            tool,
            errand: joined(
              named.map((surface) => HANDS_ON_ERRANDS[surface]),
              "and",
            ),
          },
        ]
      : [];
  });
}

/** `a, b and c` — the last one joined by a word, the way a person reads a list. */
function joined(items: readonly string[], word: string): string {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`
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
          `Some things are the person's own to do and are not in this list: ${cards.map((card) => card.errand).join("; ")}. Hand those over with ${joined(
            cards.map((card) => card.tool),
            "or",
          )}.`,
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
