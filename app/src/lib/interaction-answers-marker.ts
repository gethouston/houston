import type {
  InteractionAnswerLine,
  InteractionAnswersPayload,
} from "@houston-ai/chat";
import { isAutoContinueMessage } from "./auto-continue-message.ts";
import { composeInteractionReply } from "./interaction-reply.ts";

const MARKER_PREFIX = "<!--houston:interaction-answers ";
const MARKER_SUFFIX = "-->";

export function encodeInteractionAnswersMessage(
  args: Parameters<typeof composeInteractionReply>[0],
): string {
  const body = composeInteractionReply(args);
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
  for (const r of args.connectRedirects)
    lines.push({ answer: args.connectRedirectLine(r.name, r.text) });
  for (const name of args.credentialedNames)
    lines.push({ answer: args.credentialedLine(name) });
  for (const name of args.skippedCredentialNames)
    lines.push({ answer: args.skippedCredentialLine(name) });
  for (const r of args.credentialRedirects)
    lines.push({ answer: args.credentialRedirectLine(r.name, r.text) });
  for (const screen of args.finishedScreens)
    lines.push({ answer: args.handsOnLine(screen) });
  for (const screen of args.skippedScreens)
    lines.push({ answer: args.handsOnSkippedLine(screen) });
  for (const r of args.handsOnRedirects)
    lines.push({ answer: args.handsOnRedirectLine(r.name, r.text) });

  return encodeInteractionAnswers(lines, body);
}

export function encodeInteractionAnswers(
  lines: InteractionAnswerLine[],
  body: string,
): string {
  const payload: InteractionAnswersPayload = { lines };
  return `${MARKER_PREFIX}${JSON.stringify(payload)}${MARKER_SUFFIX}\n\n${body}`;
}
