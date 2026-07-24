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

/** One connect step's FINAL outcome in a walked sequence: the app's display
 *  name and whether it ended connected (true) or skipped (false). A step skipped
 *  then reconsidered records `connected: true` — the LAST outcome for a step id
 *  wins, so the composed reply never carries a stale "Skipped ..." line. */
export interface ConnectOutcome {
  name: string;
  connected: boolean;
  /** A declined step's typed "do this instead" text (the decline row). Present
   *  only on a decline WITH an instruction; a plain skip leaves it undefined. */
  message?: string;
}

/**
 * Split the connect steps' FINAL outcomes into the connected + skipped + declined-
 * with-instruction lists the reply names, in step order. Keyed by step id, so
 * recording a connect over an earlier skip for the SAME step (a reconsider) — or
 * a repeated skip — yields exactly one entry per step, in exactly one list.
 * Steps with no recorded outcome (never reached) are omitted. A declined step
 * whose typed text is non-empty lands in `connectRedirects` (it carries user
 * text, so the sequence resumes visibly); a plain skip lands in
 * `skippedConnectNames`.
 */
export function finalConnectNames(
  connectStepIds: string[],
  outcomes: Map<string, ConnectOutcome>,
): {
  connectedNames: string[];
  skippedConnectNames: string[];
  connectRedirects: { name: string; text: string }[];
} {
  const connectedNames: string[] = [];
  const skippedConnectNames: string[] = [];
  const connectRedirects: { name: string; text: string }[] = [];
  for (const id of connectStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (outcome.connected) {
      connectedNames.push(outcome.name);
    } else if (outcome.message != null && outcome.message.length > 0) {
      connectRedirects.push({ name: outcome.name, text: outcome.message });
    } else {
      skippedConnectNames.push(outcome.name);
    }
  }
  return { connectedNames, skippedConnectNames, connectRedirects };
}

/** One credential step's FINAL outcome in a walked sequence: the integration's
 *  display name and whether its key ended saved (true) or skipped (false). A step
 *  skipped then reconsidered records `saved: true` — the LAST outcome for a step
 *  id wins, so the reply never carries a stale "Skipped ..." line. Mirrors
 *  {@link ConnectOutcome}. */
export interface CredentialOutcome {
  name: string;
  saved: boolean;
  /** A declined step's typed "do this instead" text (the decline row). Present
   *  only on a decline WITH an instruction; a plain skip leaves it undefined. */
  message?: string;
}

/**
 * Split the credential steps' FINAL outcomes into the saved + skipped + declined-
 * with-instruction lists the reply names, in step order. Keyed by step id, so
 * saving a key over an earlier skip for the SAME step (a reconsider) — or a
 * repeated skip — yields exactly one entry per step. Steps with no recorded
 * outcome (never reached) are omitted. A declined step whose typed text is
 * non-empty lands in `credentialRedirects` (it carries user text, so the sequence
 * resumes visibly); a plain skip lands in `skippedCredentialNames`. Mirrors
 * {@link finalConnectNames}.
 */
export function finalCredentialNames(
  credentialStepIds: string[],
  outcomes: Map<string, CredentialOutcome>,
): {
  credentialedNames: string[];
  skippedCredentialNames: string[];
  credentialRedirects: { name: string; text: string }[];
} {
  const credentialedNames: string[] = [];
  const skippedCredentialNames: string[] = [];
  const credentialRedirects: { name: string; text: string }[] = [];
  for (const id of credentialStepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (outcome.saved) {
      credentialedNames.push(outcome.name);
    } else if (outcome.message != null && outcome.message.length > 0) {
      credentialRedirects.push({ name: outcome.name, text: outcome.message });
    } else {
      skippedCredentialNames.push(outcome.name);
    }
  }
  return { credentialedNames, skippedCredentialNames, credentialRedirects };
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
