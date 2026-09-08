import type {
  InteractionAnswerLine,
  InteractionAnswersPayload,
} from "@houston-ai/chat";
import { isAutoContinueMessage } from "./auto-continue-message.ts";
import { composeInteractionReply } from "./interaction-reply.ts";

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
  if (args.signinDeclineText != null)
    lines.push({ answer: args.signinRedirectLine(args.signinDeclineText) });
  for (const name of args.connectedNames)
    lines.push({ answer: args.connectedLine(name) });
  for (const name of args.skippedConnectNames)
    lines.push({ answer: args.skippedConnectLine(name) });
  // A connect/credential decline-with-instruction reads the same for the model
  // and the user (the app name is already human), so ONE factory serves both.
  for (const r of args.connectRedirects)
    lines.push({ answer: args.connectRedirectLine(r.name, r.text) });
  for (const name of args.credentialedNames)
    lines.push({ answer: args.credentialedLine(name) });
  for (const name of args.skippedCredentialNames)
    lines.push({ answer: args.skippedCredentialLine(name) });
  for (const r of args.credentialRedirects)
    lines.push({ answer: args.credentialRedirectLine(r.name, r.text) });

  const payload: InteractionAnswersPayload = { lines };
  return `${MARKER_PREFIX}${JSON.stringify(payload)}${MARKER_SUFFIX}\n\n${body}`;
}
