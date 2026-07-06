import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordPendingInteraction } from "../interaction";

/**
 * The blocking-question tool. Any time the model needs the user to answer,
 * choose, or approve before it can continue, it calls `ask_user` instead of
 * ending its turn with a question in plain text. Executing it records the
 * pending interaction for this turn (carried on the terminal `done` frame), and
 * Houston renders the question as an interactive card in place of the chat
 * input. The user's answer arrives as a normal user message on the next turn.
 *
 * Available in EVERY mode/backend that can receive Houston's custom tools (i.e.
 * the pi backend) — it holds no credential and makes no network call.
 */

const AskUserParams = Type.Object({
  question: Type.String({
    description:
      "The exact question to show the user, in plain everyday language. Ask one thing.",
  }),
  options: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String({
          description: "A short stable identifier for this choice.",
        }),
        label: Type.String({
          description: "The short user-facing label for this choice.",
        }),
      }),
      {
        description:
          "Optional 2-6 short, mutually-exclusive choices to offer as buttons. Use for a choice or an approval; omit for an open question.",
      },
    ),
  ),
});
type AskUserParams = Static<typeof AskUserParams>;

/** The instruction returned to the model after the question is recorded. */
const ASK_USER_INSTRUCTION =
  "Your question is now shown to the user as an interactive card in place of the chat input. End your turn immediately. Do not repeat the question in your reply text, and do not ask anything else — the user's answer will arrive as a normal message.";

/** The always-available blocking-question tool. */
export function makeAskUserTool() {
  return defineTool({
    name: "ask_user",
    label: "Ask the user",
    description:
      "Ask the user a blocking question, offer them a choice, or request their approval before continuing. Houston shows it as an interactive card in place of the chat input; end your turn right after calling this. ALWAYS use this instead of ending your turn with a question written in plain text.",
    promptSnippet: "Ask the user a question and wait for their answer",
    parameters: AskUserParams,
    executionMode: "sequential",
    async execute(_id: string, params: AskUserParams) {
      const options =
        params.options && params.options.length > 0
          ? params.options
          : undefined;
      recordPendingInteraction({
        kind: "question",
        question: params.question,
        ...(options ? { options } : {}),
      });
      return {
        content: [{ type: "text" as const, text: ASK_USER_INSTRUCTION }],
        details: { question: params.question, options: options ?? [] },
      };
    },
  });
}

/** The tool name — pi's allowlist needs it alongside the object. */
export const ASK_USER_TOOL_NAME = "ask_user";
