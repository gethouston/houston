import type {
  ChatInteractionAnswer,
  InteractionAnswerLine,
  InteractionAnswersPayload,
} from "@houston-ai/chat";
import {
  encodeAutoContinueMessage,
  isAutoContinueMessage,
} from "./auto-continue-message.ts";

/**
 * The single message an interaction sequence sends when its LAST step
 * completes (see `useAgentChatPanel`'s `composerOverride`). Composed ONCE, never
 * per-connect: a `request_connection` step that started a turn as it landed
 * would tear the interaction card down before the remaining steps could be
 * walked, so the whole sequence resumes the agent with exactly this one send.
 *
 * The body is `"<question>: <answer>"` per answered question, then
 * `"Signed in to Houston."` if a sign-in step completed (or "Skipped signing
 * in." if the user skipped it), then `"Connected <app>."` per connection that
 * landed and `"Skipped connecting <app>."` per connect step the user skipped —
 * a skip is a fact the agent MUST hear, or it re-requests the same app
 * forever. A sequence with questions sends that body visibly (the user typed
 * those answers). A connect-ONLY / signin+connect sequence has no user-typed
 * text, so it wraps the body in the auto-continue marker: the agent still
 * receives the instruction, but the transcript hides the bubble the user never
 * actually typed.
 *
 * A SIGNIN-ONLY sequence that actually signed in (no questions, no connect
 * steps walked or skipped) has nothing factual to relay, so it resumes the
 * agent with the dedicated hidden `signedInFollowup` ("I've signed in. Please
 * continue.") instead of the bare status line.
 *
 * The line factories (`connectedLine` / `skippedConnectLine` / `signedInLine` /
 * `skippedSigninLine` / `signedInFollowup`) are injected so this stays
 * i18n-agnostic and unit-testable — the caller passes the `t(...)` results.
 */
export function composeInteractionReply(args: {
  answers: ChatInteractionAnswer[];
  connectedNames: string[];
  /** Apps whose connect step the user skipped, in skip order. */
  skippedConnectNames: string[];
  hasQuestionSteps: boolean;
  /** A sign-in step completed in this sequence (the user is now signed in). */
  signedIn: boolean;
  /** The user skipped the sequence's sign-in step. */
  signinSkipped: boolean;
  connectedLine: (name: string) => string;
  /** The status line a skipped connect step contributes to the reply. */
  skippedConnectLine: (name: string) => string;
  /** The status line a completed sign-in contributes to a composed reply. */
  signedInLine: string;
  /** The status line a skipped sign-in step contributes to the reply. */
  skippedSigninLine: string;
  /** The hidden resume message for a signin-ONLY sequence (nothing else to say). */
  signedInFollowup: string;
}): string {
  // Signin-only, actually signed in: no answers to relay, no connection and no
  // skip to name, so send the friendlier hidden followup rather than a lone
  // "Signed in to Houston." line.
  if (
    !args.hasQuestionSteps &&
    args.signedIn &&
    args.connectedNames.length === 0 &&
    args.skippedConnectNames.length === 0
  )
    return encodeAutoContinueMessage(args.signedInFollowup);

  const lines = args.answers.map((a) => `${a.question}: ${a.answer}`);
  if (args.signedIn) lines.push(args.signedInLine);
  if (args.signinSkipped) lines.push(args.skippedSigninLine);
  for (const name of args.connectedNames) lines.push(args.connectedLine(name));
  for (const name of args.skippedConnectNames)
    lines.push(args.skippedConnectLine(name));
  const body = lines.join("\n");
  return args.hasQuestionSteps ? body : encodeAutoContinueMessage(body);
}

const MARKER_PREFIX = "<!--houston:interaction-answers ";
const MARKER_SUFFIX = "-->";

/**
 * The interaction reply, wrapped so the transcript can render the answers as a
 * structured Q&A card instead of an undifferentiated text bubble.
 *
 * Takes the SAME inputs as {@link composeInteractionReply} and delegates to it
 * for the flat body the model reads — behavior for the agent is unchanged. On
 * top it carries the SAME information in a structured `InteractionAnswersPayload`
 * (decoded + rendered by `@houston-ai/chat`) behind an HTML-comment marker,
 * exactly like the Skill marker.
 *
 * A hidden auto-continue sequence (connect-only / signin-only, no questions)
 * never renders a user bubble, so there is nothing to structure-render: the
 * flat reply is returned unchanged, no marker added.
 */
export function encodeInteractionAnswersMessage(
  args: Parameters<typeof composeInteractionReply>[0],
): string {
  const body = composeInteractionReply(args);
  // Hidden (no visible bubble) → leave the flat reply untouched.
  if (isAutoContinueMessage(body)) return body;

  const lines: InteractionAnswerLine[] = args.answers.map((a) => ({
    question: a.question,
    answer: a.answer,
  }));
  if (args.signedIn) lines.push({ answer: args.signedInLine });
  if (args.signinSkipped) lines.push({ answer: args.skippedSigninLine });
  for (const name of args.connectedNames)
    lines.push({ answer: args.connectedLine(name) });
  for (const name of args.skippedConnectNames)
    lines.push({ answer: args.skippedConnectLine(name) });

  const payload: InteractionAnswersPayload = { lines };
  return `${MARKER_PREFIX}${JSON.stringify(payload)}${MARKER_SUFFIX}\n\n${body}`;
}
