import { defineTool } from "@earendil-works/pi-coding-agent";
import type { InteractionStep } from "@houston/runtime-client";
import { type Static, Type } from "typebox";
import { recordQuestions } from "../interaction";
import { assertNotAutoMode } from "../live-mode-gate";

/**
 * The blocking-question tool. Any time the model needs the user to answer,
 * choose, or approve before it can continue, it calls `ask_user` instead of
 * ending its turn with a question in plain text. It batches EVERYTHING it needs
 * — up to 3 questions — into ONE call: executing it records the question steps
 * of this turn's interaction sequence (carried on the terminal `done` frame),
 * and Houston walks the user through them one at a time in a single interactive
 * card in place of the chat input. The user's answers arrive as a normal user
 * message on the next turn. If the same turn also needs an app connected, the
 * model calls `request_connection` too — both feed ONE interaction flow.
 *
 * Available in EVERY mode/backend that can receive Houston's custom tools (i.e.
 * the pi backend) — it holds no credential and makes no network call.
 */

/** The most questions one `ask_user` card may carry. A cap, not a norm. */
const MAX_QUESTIONS = 3;

const AskUserParams = Type.Object({
  questions: Type.Array(
    Type.Object({
      question: Type.String({
        description:
          "ONE question to show the user, in plain everyday language. Never fuse two asks into one ('Should I do X? If so, what is Y?') — make them separate questions in this same call.",
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
            recommended: Type.Optional(
              Type.Boolean({
                description:
                  "Set true on AT MOST ONE option in the list to mark it as the suggested default. Shown to the user as a small 'Recommended' chip. Never mark more than one.",
              }),
            ),
          }),
          {
            description:
              "2-6 short, mutually-exclusive choices for this question, offered as single-select rows. Provide these for nearly every question — whenever you can think of likely answers, offer them as choices. Omit ONLY for genuinely open input (a name, an address, content to write). The user can always type a custom answer instead of picking one, so never add a catch-all choice like 'Other' or 'Something else' to this list.",
          },
        ),
      ),
    }),
    {
      minItems: 1,
      maxItems: MAX_QUESTIONS,
      description:
        "1 to 3 questions to ask together as one card. Batch everything you need before acting into this ONE call; never ask one question per turn.",
    },
  ),
});
type AskUserParams = Static<typeof AskUserParams>;

/** The instruction returned to the model after the questions are recorded. */
const ASK_USER_INSTRUCTION =
  "Your questions were added to the one interaction card Houston shows the user in place of the chat input, walked one at a time. Queue everything you still need for this task now: if an app must be connected too, call request_connection in this SAME turn, then end your turn. Do not repeat the questions in your reply text, and do not ask anything else in plain text. The user's answers will arrive as a normal message.";

/** The always-available blocking-question tool. */
export function makeAskUserTool() {
  return defineTool({
    name: "ask_user",
    label: "Ask the user",
    description:
      "Ask the user up to 3 blocking questions, offer choices, or request approval before continuing. Batch everything you need before you can act into this ONE call — never drip one question per turn. Houston shows the batch as a single interactive card in place of the chat input; end your turn right after calling this. ALWAYS use this instead of ending your turn with a question written in plain text.",
    promptSnippet: "Ask the user up to 3 questions and wait for their answers",
    parameters: AskUserParams,
    executionMode: "sequential",
    async execute(_id: string, params: AskUserParams) {
      // Live gate for the mid-turn Mode-pill switch: a turn built with ask_user
      // available may now be running in Autopilot — never wait on the user.
      assertNotAutoMode("ask the user questions or wait for their input");
      if (
        params.questions.length < 1 ||
        params.questions.length > MAX_QUESTIONS
      ) {
        throw new Error(
          `ask_user takes 1 to ${MAX_QUESTIONS} questions in one call (got ${params.questions.length}). Merge or trim your questions so at most ${MAX_QUESTIONS} are asked together.`,
        );
      }
      const questions = params.questions.map(
        (q, i): Extract<InteractionStep, { kind: "question" }> => ({
          kind: "question",
          id: `q${i + 1}`,
          question: q.question,
          ...(q.options && q.options.length > 0 ? { options: q.options } : {}),
        }),
      );
      recordQuestions(questions);
      return {
        content: [{ type: "text" as const, text: ASK_USER_INSTRUCTION }],
        details: { questions },
      };
    },
  });
}

/** The tool name — pi's allowlist needs it alongside the object. */
export const ASK_USER_TOOL_NAME = "ask_user";
