import {
  HANDS_ON_SURFACES,
  type HandsOnSurface,
  isHandsOnSurface,
} from "@houston/protocol/interaction-types";

export const ASSISTANT_HANDS_TOOLS = [
  "request_connection",
  "request_credential",
  "request_provider_connection",
  "request_hands_on",
] as const;

export type AssistantHandsTool = (typeof ASSISTANT_HANDS_TOOLS)[number];

export type AssistantHands =
  | { kind: "card"; tool: AssistantHandsTool; surface?: HandsOnSurface }
  | { kind: "unreachable"; reason: string };

export interface AssistantHandsProblem {
  kind: "invalid";
  problem: string;
}

const UNREACHABLE = /^unreachable\b\s*([\s\S]*)$/;
const CARD = /^([a-z][a-z_]*)(?:\(\s*([^()]*?)\s*\))?$/;

const isHandsTool = (value: string): value is AssistantHandsTool =>
  (ASSISTANT_HANDS_TOOLS as readonly string[]).includes(value);

export function parseAssistantHands(
  text: string,
): AssistantHands | AssistantHandsProblem {
  const trimmed = text.trim();
  const stated = UNREACHABLE.exec(trimmed);
  if (stated) {
    const reason = (stated[1] ?? "").trim();
    return reason
      ? { kind: "unreachable", reason }
      : {
          kind: "invalid",
          problem: "`unreachable` says nothing about why no card reaches it.",
        };
  }
  const card = CARD.exec(trimmed);
  if (!card)
    return { kind: "invalid", problem: `\`${trimmed}\` is not a card name.` };
  const tool = card[1] ?? "";
  const surface = card[2];
  if (!isHandsTool(tool))
    return {
      kind: "invalid",
      problem: `\`${tool}\` is not one of ${ASSISTANT_HANDS_TOOLS.join(", ")}.`,
    };
  if (tool !== "request_hands_on")
    return surface === undefined
      ? { kind: "card", tool }
      : {
          kind: "invalid",
          problem: `\`${tool}\` takes no surface; only request_hands_on names one.`,
        };
  if (surface === undefined)
    return {
      kind: "invalid",
      problem: `\`request_hands_on\` names the screen the person is sent to: one of ${HANDS_ON_SURFACES.join(", ")}.`,
    };
  return isHandsOnSurface(surface)
    ? { kind: "card", tool, surface }
    : {
        kind: "invalid",
        problem: `\`${surface}\` is not one of ${HANDS_ON_SURFACES.join(", ")}.`,
      };
}
