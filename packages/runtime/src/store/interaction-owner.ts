import {
  hasOnlySuggestionSteps,
  parsePendingInteraction,
} from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";

export const NOT_INTERACTION_OWNER = "not_interaction_owner";

export const notInteractionOwnerBody = {
  error: NOT_INTERACTION_OWNER,
  code: NOT_INTERACTION_OWNER,
} as const;

export function interactionOwner(
  messages: readonly ChatMessage[],
): string | undefined {
  let at = messages.length - 1;
  while (at >= 0 && messages[at]?.role !== "assistant") at--;
  const card = messages[at];
  if (!card || card.stopped) return undefined;
  const interaction = parsePendingInteraction(card.pendingInteraction);
  if (!interaction || hasOnlySuggestionSteps(interaction.steps))
    return undefined;
  for (let i = at - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (card.turnId === undefined || message.turnId === card.turnId)
      return message.author?.userId;
  }
  return undefined;
}

export function refusesInteractionAnswer(
  messages: readonly ChatMessage[],
  actingUserId: string | undefined,
): boolean {
  if (!actingUserId) return false;
  const owner = interactionOwner(messages);
  return owner !== undefined && owner !== actingUserId;
}
