import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { encodeAutoContinueMessage } from "./auto-continue-message.ts";

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
 * steps walked or skipped) has nothing factual to relay, so
 * it resumes the agent with the dedicated hidden `signedInFollowup` ("I've signed
 * in. Please continue.") instead of the bare status line.
 *
 * A saved custom-integration key adds `credentialedLine(name)` ("Added the X
 * key."), a declined one `skippedCredentialLine(name)` ("Skipped adding the X
 * key.") — a skip the agent MUST hear, or it waits on a key that never comes. A
 * credential-ONLY sequence that saved every key resumes the agent hidden with
 * `credentialedFollowup`, like a connect-only one; a skip in the mix falls to the
 * visible/hidden body path so the "Skipped ..." fact survives.
 *
 * Every non-question step ALSO offers a free-text decline row: declining a
 * connect / sign-in / credential step WITH typed text records a
 * decline-with-instruction, contributing `connectRedirectLine(name, text)` /
 * `signinRedirectLine(text)` / `credentialRedirectLine(name, text)` — the user's
 * verbatim "do this instead", which the agent reads and reacts to. Because it
 * carries user text, its sequence resumes VISIBLY.
 *
 * The line factories (`connectedLine` / `skippedConnectLine` / `connectRedirectLine`
 * / `signedInLine` / `skippedSigninLine` / `signinRedirectLine` / `signedInFollowup`
 * / `credentialedLine` / `skippedCredentialLine` / `credentialRedirectLine`) are
 * injected so this stays i18n-agnostic and unit-testable — the caller passes the
 * `t(...)` results.
 */
export function composeInteractionReply(args: {
  answers: ChatInteractionAnswer[];
  connectedNames: string[];
  /** Apps whose connect step the user skipped, in skip order. */
  skippedConnectNames: string[];
  /** Custom integrations whose secret the user saved during THIS sequence. */
  credentialedNames: string[];
  /** Custom integrations whose credential step the user skipped, in skip order —
   *  a decline the agent MUST hear, or it waits on a key that never comes. */
  skippedCredentialNames: string[];
  /** Connect steps declined WITH a typed instruction (the "or tell it what to do
   *  instead" row): the app name plus the user's verbatim text, in step order.
   *  Like a redirection, the text rides the reply so the agent reacts, and its
   *  presence makes the sequence resume VISIBLY. */
  connectRedirects: { name: string; text: string }[];
  /** Credential steps declined WITH a typed instruction, in step order. */
  credentialRedirects: { name: string; text: string }[];
  /** The typed instruction on a declined sign-in step (what to do instead of
   *  signing in), or undefined when the sign-in step was not declined with text. */
  signinDeclineText?: string;
  hasQuestionSteps: boolean;
  /** A sign-in step completed in this sequence (the user is now signed in). */
  signedIn: boolean;
  /** The user skipped the sequence's sign-in step. */
  signinSkipped: boolean;
  connectedLine: (name: string) => string;
  /** The status line a skipped connect step contributes to the reply. */
  skippedConnectLine: (name: string) => string;
  /** The status line a saved custom-integration key contributes to a reply. */
  credentialedLine: (name: string) => string;
  /** The status line a skipped credential step contributes to the reply. */
  skippedCredentialLine: (name: string) => string;
  /** The status line a completed sign-in contributes to a composed reply. */
  signedInLine: string;
  /** The status line a skipped sign-in step contributes to the reply. */
  skippedSigninLine: string;
  /** The hidden resume message for a signin-ONLY sequence (nothing else to say). */
  signedInFollowup: string;
  /** The line a connect step declined-with-text contributes: the app name plus
   *  the user's verbatim instruction (model-facing AND visible — the app name is
   *  already human, so ONE line serves both, like `connectedLine`). */
  connectRedirectLine: (name: string, text: string) => string;
  /** The line a credential step declined-with-text contributes (app name + text). */
  credentialRedirectLine: (name: string, text: string) => string;
  /** The line a sign-in step declined-with-text contributes (the user's text). */
  signinRedirectLine: (text: string) => string;
  /** The hidden resume message for a credential-ONLY sequence (secret saved). */
  credentialedFollowup: string;
}): string {
  // Signin-only, actually signed in: no answers to relay, no connection and no
  // skip to name, so send the friendlier hidden followup rather than a lone
  // "Signed in to Houston." line.
  if (
    !args.hasQuestionSteps &&
    args.signedIn &&
    args.connectedNames.length === 0 &&
    args.skippedConnectNames.length === 0 &&
    args.credentialedNames.length === 0 &&
    args.skippedCredentialNames.length === 0
  )
    return encodeAutoContinueMessage(args.signedInFollowup);

  // Credential-only, all saved: mirror the signin-only case — resume the agent
  // with the dedicated hidden followup ("I've added the X key. Please continue.")
  // instead of a bare "Added the X key." status line. A skip in the mix drops to
  // the general path below so the agent still hears the "Skipped ..." fact.
  if (
    !args.hasQuestionSteps &&
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
  const body = lines.join("\n");
  // A redirection or a decline-with-instruction carries user-typed text, so its
  // sequence resumes VISIBLY (the transcript should show what the user asked),
  // like a question sequence.
  const visible =
    args.hasQuestionSteps ||
    args.connectRedirects.length > 0 ||
    args.credentialRedirects.length > 0 ||
    args.signinDeclineText != null;
  return visible ? body : encodeAutoContinueMessage(body);
}
