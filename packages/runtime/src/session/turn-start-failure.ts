import type { ChatMessage } from "@houston/runtime-client";
import { stampCredentialScope } from "../ai/provider-error";
import { logProviderError } from "../ai/provider-error-log";
import { storedCardRefuses } from "../store/conversation-card";
import {
  appendAssistantMessage,
  appendUserMessage,
} from "../store/conversations";
import { NOT_INTERACTION_OWNER } from "../store/interaction-owner";
import { publish } from "./bus";
import type { TurnPin } from "./exec-turn";

export interface TurnStartFailure {
  readonly id: string;
  readonly turnId: string;
  readonly text: string;
  readonly nonce: string | undefined;
  readonly displayText: string | undefined;
  readonly mentions: ChatMessage["mentions"] | undefined;
}

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

function recordRefusedUserTurn(turn: TurnStartFailure): void {
  appendUserMessage(turn.id, turn.text, {
    turnId: turn.turnId,
    nonce: turn.nonce,
    displayText: turn.displayText,
    mentions: turn.mentions,
  });
  publish(turn.id, {
    type: "user",
    data: {
      content: turn.text,
      ts: Date.now(),
      nonce: turn.nonce,
      mentions: turn.mentions,
    },
    turnId: turn.turnId,
  });
}

export function reportPinnedProviderUnavailable(
  turn: TurnStartFailure,
  provider: string,
): void {
  recordRefusedUserTurn(turn);
  const message = `No provider connected for ${provider}. Connect it first.`;
  appendAssistantMessage(turn.id, "", {
    providerError: stampCredentialScope({
      kind: "unauthenticated",
      provider,
      cause: "no_credentials",
      message,
      undelivered_prompt: turn.text,
    }),
    turnId: turn.turnId,
  });
  publish(turn.id, { type: "error", data: { message }, turnId: turn.turnId });
}

export function reportTurnStartFailure(
  turn: TurnStartFailure,
  err: unknown,
  pin: TurnPin | undefined,
): void {
  recordRefusedUserTurn(turn);
  const message = errMessage(err);
  const notConnected = /no local model configured|no provider connected/i.test(
    message,
  );
  const synthesized = stampCredentialScope(
    notConnected
      ? {
          kind: "unauthenticated",
          provider: pin?.provider ?? "",
          cause: "no_credentials",
          message,
          undelivered_prompt: turn.text,
        }
      : {
          kind: "unknown",
          provider: pin?.provider ?? "unknown",
          raw_excerpt: message,
        },
  );
  logProviderError(synthesized, { model: pin?.model ?? null });
  appendAssistantMessage(turn.id, "", {
    providerError: synthesized,
    turnId: turn.turnId,
  });
  publish(turn.id, { type: "error", data: { message }, turnId: turn.turnId });
}

export interface CardAnswer {
  userId: string;
  onRefused: () => void;
}

export function refuseQueuedCardAnswer(
  id: string,
  turnId: string,
  answer: CardAnswer | undefined,
): boolean {
  if (!answer || !storedCardRefuses(id, answer.userId)) return false;
  answer.onRefused();
  const data = { message: NOT_INTERACTION_OWNER, code: NOT_INTERACTION_OWNER };
  publish(id, { type: "error", data, turnId });
  return true;
}
