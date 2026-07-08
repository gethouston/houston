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
 * `"Signed in to Houston."` if a sign-in step completed, then `"Connected
 * <app>."` per connection / integration that landed, then a declined line per
 * custom-integration / MCP-server proposal the user waved off. A sequence with
 * questions sends that body visibly (the user typed those answers). A
 * connect-ONLY / signin+connect / proposal-only sequence has no user-typed text,
 * so it wraps the body in the auto-continue marker: the agent still receives the
 * instruction, but the transcript hides the bubble the user never actually
 * typed.
 *
 * A SIGNIN-ONLY sequence (no questions, no connections) has nothing factual to
 * relay, so it resumes the agent with the dedicated hidden `signedInFollowup`
 * ("I've signed in. Please continue.") instead of the bare status line.
 *
 * `connectedLine` / `signedInLine` / `signedInFollowup` are injected so this
 * stays i18n-agnostic and unit-testable — the caller passes the `t(...)` results.
 */
export function composeInteractionReply(args: {
  answers: ChatInteractionAnswer[];
  connectedNames: string[];
  /** Names of custom-integration / MCP-server proposals the user declined. */
  declinedNames?: string[];
  hasQuestionSteps: boolean;
  /** A sign-in step completed in this sequence (the user is now signed in). */
  signedIn: boolean;
  connectedLine: (name: string) => string;
  /** The line a declined proposal contributes ("I decided not to add X."). */
  declinedLine?: (name: string) => string;
  /** The status line a completed sign-in contributes to a composed reply. */
  signedInLine: string;
  /** The hidden resume message for a signin-ONLY sequence (nothing else to say). */
  signedInFollowup: string;
}): string {
  const declinedNames = args.declinedNames ?? [];
  // Signin-only: no answers to relay, no connection to name, nothing declined,
  // so send the friendlier hidden followup rather than a lone status line.
  if (
    !args.hasQuestionSteps &&
    args.signedIn &&
    args.connectedNames.length === 0 &&
    declinedNames.length === 0
  )
    return encodeAutoContinueMessage(args.signedInFollowup);

  const lines = args.answers.map((a) => `${a.question}: ${a.answer}`);
  if (args.signedIn) lines.push(args.signedInLine);
  for (const name of args.connectedNames) lines.push(args.connectedLine(name));
  if (args.declinedLine)
    for (const name of declinedNames) lines.push(args.declinedLine(name));
  const body = lines.join("\n");
  return args.hasQuestionSteps ? body : encodeAutoContinueMessage(body);
}
