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

export type IndexOperation = Pick<
  AssistantOperationDocument,
  "name" | "group" | "hidden" | "route" | "hands"
>;

const HANDS_ERRANDS: Readonly<
  Record<Exclude<AssistantHandsTool, "request_hands_on">, string>
> = {
  request_connection: "connecting an app",
  request_credential: "giving an app its own key",
  request_provider_connection: "signing in to an AI provider",
};

const HANDS_ON_ERRANDS: Readonly<Record<HandsOnSurface, string>> = {
  apiKeys: "one-time keys",
  billing: "billing",
  files: "files on their device",
  routineWebhook: "a routine's webhook",
  orgDanger: "destroying a shared space",
  agentApiAccess: "connecting an AI Employee to their own code",
};

interface HandsCard {
  tool: AssistantHandsTool;
  errand: string;
}

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

function joined(items: readonly string[], word: string): string {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`
    : (items[0] ?? "");
}

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
