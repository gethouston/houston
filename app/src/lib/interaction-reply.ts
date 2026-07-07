import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { encodeAutoContinueMessage } from "./auto-continue-message.ts";

/**
 * The single message an interaction sequence sends when its LAST step
 * completes (see `useAgentChatPanel`'s `composerOverride`). Composed ONCE, never
 * per-connect: a `request_connection` step that started a turn as it landed
 * would tear the interaction card down before the remaining steps could be
 * walked, so the whole sequence resumes the agent with exactly this one send.
 *
 * The body is `"<question>: <answer>"` per answered question followed by
 * `"Connected <app>."` per connection that landed. A sequence with questions
 * sends that body visibly (the user typed those answers). A connect-ONLY
 * sequence has no user-typed text, so it wraps the body in the auto-continue
 * marker: the agent still receives the instruction, but the transcript hides the
 * bubble the user never actually typed.
 *
 * `connectedLine` is injected so this stays i18n-agnostic and unit-testable —
 * the caller passes `t("chat:interaction.connectedLine", { name })`.
 */
export function composeInteractionReply(args: {
  answers: ChatInteractionAnswer[];
  connectedNames: string[];
  hasQuestionSteps: boolean;
  connectedLine: (name: string) => string;
}): string {
  const lines = args.answers.map((a) => `${a.question}: ${a.answer}`);
  for (const name of args.connectedNames) lines.push(args.connectedLine(name));
  const body = lines.join("\n");
  return args.hasQuestionSteps ? body : encodeAutoContinueMessage(body);
}
