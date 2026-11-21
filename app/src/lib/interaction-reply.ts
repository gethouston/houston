import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { encodeAutoContinueMessage } from "./auto-continue-message.ts";

export function composeInteractionReply(args: {
  answers: ChatInteractionAnswer[];
  connectedNames: string[];
  skippedConnectNames: string[];
  credentialedNames: string[];
  skippedCredentialNames: string[];
  finishedScreens: string[];
  skippedScreens: string[];
  handsOnRedirects: { name: string; text: string }[];
  connectRedirects: { name: string; text: string }[];
  credentialRedirects: { name: string; text: string }[];
  signinDeclineText?: string;
  hasQuestionSteps: boolean;
  signedIn: boolean;
  signinSkipped: boolean;
  connectedLine: (name: string) => string;
  skippedConnectLine: (name: string) => string;
  credentialedLine: (name: string) => string;
  skippedCredentialLine: (name: string) => string;
  signedInLine: string;
  skippedSigninLine: string;
  signedInFollowup: string;
  connectRedirectLine: (name: string, text: string) => string;
  credentialRedirectLine: (name: string, text: string) => string;
  signinRedirectLine: (text: string) => string;
  credentialedFollowup: string;
  handsOnLine: (screen: string) => string;
  handsOnSkippedLine: (screen: string) => string;
  handsOnRedirectLine: (screen: string, text: string) => string;
}): string {
  const noHandsOn =
    args.finishedScreens.length === 0 &&
    args.skippedScreens.length === 0 &&
    args.handsOnRedirects.length === 0;
  if (
    !args.hasQuestionSteps &&
    noHandsOn &&
    args.signedIn &&
    args.connectedNames.length === 0 &&
    args.skippedConnectNames.length === 0 &&
    args.credentialedNames.length === 0 &&
    args.skippedCredentialNames.length === 0
  )
    return encodeAutoContinueMessage(args.signedInFollowup);

  if (
    !args.hasQuestionSteps &&
    noHandsOn &&
    !args.signedIn &&
    args.connectedNames.length === 0 &&
    args.skippedConnectNames.length === 0 &&
    args.skippedCredentialNames.length === 0 &&
    args.credentialRedirects.length === 0 &&
    args.credentialedNames.length > 0
  )
    return encodeAutoContinueMessage(args.credentialedFollowup);

  const lines = args.answers.map((a) => `${a.question}: ${a.answer}`);
  if (args.signedIn) lines.push(args.signedInLine);
  if (args.signinSkipped) lines.push(args.skippedSigninLine);
  if (args.signinDeclineText != null)
    lines.push(args.signinRedirectLine(args.signinDeclineText));
  for (const name of args.connectedNames) lines.push(args.connectedLine(name));
  for (const name of args.skippedConnectNames)
    lines.push(args.skippedConnectLine(name));
  for (const r of args.connectRedirects)
    lines.push(args.connectRedirectLine(r.name, r.text));
  for (const name of args.credentialedNames)
    lines.push(args.credentialedLine(name));
  for (const name of args.skippedCredentialNames)
    lines.push(args.skippedCredentialLine(name));
  for (const r of args.credentialRedirects)
    lines.push(args.credentialRedirectLine(r.name, r.text));
  for (const screen of args.finishedScreens)
    lines.push(args.handsOnLine(screen));
  for (const screen of args.skippedScreens)
    lines.push(args.handsOnSkippedLine(screen));
  for (const r of args.handsOnRedirects)
    lines.push(args.handsOnRedirectLine(r.name, r.text));
  const body = lines.join("\n");
  const visible =
    args.hasQuestionSteps ||
    args.connectRedirects.length > 0 ||
    args.credentialRedirects.length > 0 ||
    args.handsOnRedirects.length > 0 ||
    args.signinDeclineText != null;
  return visible ? body : encodeAutoContinueMessage(body);
}
