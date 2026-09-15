import {
  HANDS_ON_SURFACES,
  type HandsOnSurface,
  isHandsOnSurface,
} from "@houston/protocol/interaction-types";

/**
 * Which card reaches a Houston operation the assistant must not call itself.
 *
 * A withheld operation is only half a decision. "The person pastes the key
 * themselves" says what the assistant may not do and leaves the errand nowhere:
 * the model has no way to learn that the app has a screen for it, so it either
 * invents a detour or tells the user Houston cannot do the thing at all. The
 * `hands:` tag is the other half — the card that DOES reach it, or the written
 * statement that none does.
 *
 * Declared in domain because both halves of the surface read it: the generator
 * validates the tag and writes it into the catalog, and the host reads the same
 * field back off the same document. The protocol import names the LEAF module,
 * not the barrel: the generator runs under `node --experimental-strip-types`,
 * which cannot resolve `@houston/protocol`'s extensionless re-exports.
 */

/** The cards that reach an operation the assistant must not call itself. */
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

/** What a tag says when it says nothing usable, in the words the gate prints. */
export interface AssistantHandsProblem {
  kind: "invalid";
  problem: string;
}

const UNREACHABLE = /^unreachable\b\s*([\s\S]*)$/;
const CARD = /^([a-z][a-z_]*)(?:\(\s*([^()]*?)\s*\))?$/;

const isHandsTool = (value: string): value is AssistantHandsTool =>
  (ASSISTANT_HANDS_TOOLS as readonly string[]).includes(value);

/** `request_hands_on(billing)` / `request_connection` / `unreachable <why>`. */
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
  // Only `request_hands_on` opens a named screen; the other three each reach
  // exactly one flow, so a surface on them names a screen nothing would open.
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
