import type { AssistantOperation } from "@houston/host/src/assistant/catalog";
import {
  confirmationKey,
  recordConfirmationRequest,
  takeConfirmationOutcome,
} from "../confirm-gate";
import { currentConversationId } from "../conversation-context";
import { recordConfirmation } from "../interaction";
import {
  type AssistantOperationResult,
  assistantErrorResult,
  assistantNeedsConfirmationResult,
} from "./assistant-result";

/**
 * The gate `houston_call` runs every `confirm: true` operation through.
 *
 * The wording on the card is written HERE, from the catalog and the arguments
 * the runtime is about to send — never by the model. That is the whole point:
 * a model that could author the question could describe a rename and perform a
 * delete, and the user would have approved the rename. What they read is what
 * would happen.
 *
 * The decision itself lives in `confirm-gate.ts`, minted only from the user's
 * own reply. Everything here is composition plus the two refusals.
 */

/** The approve/deny answers. Their labels are half of the reply line the gate
 *  matches, so they are constants: a reworded label is a new gate. */
const APPROVE = { id: "approve", label: "Yes, go ahead" } as const;
const DECLINE = { id: "decline", label: "No, don't do it" } as const;

/** The question every approval card closes on. */
const CLOSING = "Houston cannot undo this for you. Should I go ahead?";

/** How many characters of one argument the card will show. */
const VALUE_LIMIT = 120;

/** `agentPath` -> `agent path`: the argument named the way a person would. */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

/** One argument's value, short enough to read on a card. */
function showValue(value: unknown): string {
  const raw =
    value === null || typeof value !== "object"
      ? String(value)
      : JSON.stringify(value);
  return raw.length > VALUE_LIMIT ? `${raw.slice(0, VALUE_LIMIT)}...` : raw;
}

/** The arguments as a phrase, so the card names WHAT it would act on. */
function describeParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${humanize(key)} "${showValue(value)}"`)
    .join(", ");
}

/** The catalog's description, guaranteed to end a sentence. */
function asSentence(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The plain-language account of what this exact call would do: the operation's
 * own description, then the arguments it would act on. No operation names, no
 * parameter syntax, nothing the user has to be technical to read.
 */
export function confirmationSummary(
  op: AssistantOperation,
  params: Record<string, unknown>,
): string {
  const sentence = asSentence(op.description);
  const detail = describeParams(params);
  if (!detail) return sentence;
  return sentence
    ? `${sentence} This affects ${detail}.`
    : `Affects ${detail}.`;
}

/** What the model is told while the user decides. It is an instruction, not a
 *  status: the failure mode this replaces is a model that "confirms" itself. */
function pendingMessage(name: string, summary: string): string {
  return `${name} was NOT performed. ${summary} Houston is now showing the user an approval card with exactly these details, and only their own answer can authorize it - you cannot. END YOUR TURN NOW and wait: do not retry this call, do not ask the same thing again in your reply text, and do not work around the gate with other operations. Deleting something and recreating it is not a workaround; the deletion still needs this approval. Once they approve, repeat this exact call unchanged and it will run, once.`;
}

/** What the model is told after the user said no. */
function declinedMessage(name: string): string {
  return `The user was shown exactly what ${name} would do and said no. It has not been performed and it must not be: do not retry it, and do not reach the same outcome through other operations. Tell them plainly that you did not do it, then ask what they would like instead.`;
}

/**
 * Decide whether one `confirm: true` call may proceed.
 *
 * Returns `undefined` when it may - either the operation needs no approval, or
 * this conversation holds a live, unspent approval for these EXACT arguments,
 * which this call consumes. Otherwise it returns the refusal the model gets and
 * (for a first ask) raises the approval card the user actually decides on.
 */
export function guardConfirmation(
  op: AssistantOperation,
  params: Record<string, unknown>,
): AssistantOperationResult | undefined {
  if (!op.confirm) return undefined;
  const conversationId = currentConversationId();
  const key = confirmationKey(op.name, params);
  const outcome = takeConfirmationOutcome(conversationId, key);
  if (outcome === "granted") return undefined;
  if (outcome === "declined")
    return assistantErrorResult(op.name, {
      code: "confirmation_declined",
      message: declinedMessage(op.name),
    });

  const summary = confirmationSummary(op, params);
  const question = `${summary} ${CLOSING}`;
  // No conversation (a direct call outside a turn) means there is nowhere for
  // an answer to arrive, so nothing can ever authorize it. Refusing is the
  // whole contract; the card is still recorded in case a holder is listening.
  if (conversationId)
    recordConfirmationRequest({
      conversationId,
      key,
      question,
      approveLabel: APPROVE.label,
      declineLabel: DECLINE.label,
    });
  recordConfirmation({ question, options: [{ ...APPROVE }, { ...DECLINE }] });
  return assistantNeedsConfirmationResult(
    op.name,
    pendingMessage(op.name, summary),
    { summary, params },
  );
}
