import type { ChatMessage } from "@houston/runtime-client";
import { stampCredentialScope } from "../ai/provider-error";
import { logProviderError } from "../ai/provider-error-log";
import {
  appendAssistantMessage,
  appendUserMessage,
} from "../store/conversations";
import { publish } from "./bus";
import type { TurnPin } from "./exec-turn";

/**
 * A turn that failed BEFORE it could execute, identified exactly like a normal
 * one: the wire identity is minted up front so even a refused turn terminates
 * under a single turnId.
 */
export interface TurnStartFailure {
  readonly id: string;
  readonly turnId: string;
  /** The prompt the model never received — echoed to the transcript and carried
   *  on the card as `undelivered_prompt`. */
  readonly text: string;
  readonly nonce: string | undefined;
  readonly displayText: string | undefined;
  readonly mentions: ChatMessage["mentions"] | undefined;
}

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** Persist the user's message and echo it, exactly as an executing turn would. */
function recordRefusedUserTurn(turn: TurnStartFailure): void {
  appendUserMessage(turn.id, turn.text, {
    turnId: turn.turnId,
    displayText: turn.displayText,
    mentions: turn.mentions,
  });
  // Publish the nonce-stamped `user` echo BEFORE the error, exactly like a
  // normal turn (recordUserTurn): the client sink adopts its turnId from
  // this echo, and a stamped `error` frame arriving with no adopted id
  // classifies as FOREIGN and is dropped — the turn then spins forever with
  // no error and no reconnect card (the disconnected-local-model repro).
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

/**
 * Refuse a turn pinned to a provider this workspace has no credential for
 * (serve mode): the user message is still recorded, and the reply is an empty
 * assistant message carrying the typed `unauthenticated` card.
 */
export function reportPinnedProviderUnavailable(
  turn: TurnStartFailure,
  provider: string,
): void {
  recordRefusedUserTurn(turn);
  const message = `No provider connected for ${provider}. Connect it first.`;
  // Synthesized, so it must stamp the credential context itself (see the
  // getConversation catch below): the card names WHOSE account is missing the
  // provider, which in a team space is the acting member's own. A no-op
  // without an acting identity, so the desktop wire shape is unchanged.
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

/**
 * Surface a session-construction failure — e.g. no provider connected, or a pin
 * naming an unknown provider — on the conversation's stream AND persist it (user
 * prompt + an empty assistant message carrying the typed reason), so an
 * unattended reader (a routine's reconcile) errors its run with the real message
 * instead of finding no reply and timing out vague.
 */
export function reportTurnStartFailure(
  turn: TurnStartFailure,
  err: unknown,
  pin: TurnPin | undefined,
): void {
  recordRefusedUserTurn(turn);
  // A NOT-CONNECTED failure is typed `unauthenticated`, not `unknown`: the
  // typed card is the full reconnect surface (correct provider label, the
  // provider's own reconnect flow — the local-model dialog for
  // openai-compatible — and the automatic task resume once the reconnect
  // completes). `undelivered_prompt` carries the turn's text because the
  // model never received it: the failure precedes the session, so neither
  // the live context nor a rebuild ever sees this message (HOU-718) — only
  // the UI transcript above does.
  const message = errMessage(err);
  const notConnected = /no local model configured|no provider connected/i.test(
    message,
  );
  // This error is SYNTHESIZED, not classified, so it must stamp the
  // credential context itself — `classifyProviderError` does it for every
  // error that goes through the classifier, and a card without the stamp
  // cannot say WHOSE account is not connected: in a team space every turn
  // runs on the acting member's own AI account (HOU-976). A no-op without an
  // acting identity, so the desktop wire shape is unchanged.
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
  // Synthesized outside the classifier = outside its log site too; without
  // this, a pre-session failure was a card we never heard about (HOU-1156).
  logProviderError(synthesized, { model: pin?.model ?? null });
  appendAssistantMessage(turn.id, "", {
    providerError: synthesized,
    turnId: turn.turnId,
  });
  publish(turn.id, { type: "error", data: { message }, turnId: turn.turnId });
}
