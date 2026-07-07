import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { ASK_USER_TOOL_NAME, makeAskUserTool } from "./ask-user";

/**
 * The always-available blocking-question tool. These pin: the tool assigns
 * `q1`..`qN` ids and records a `question` interaction on the turn's holder (with
 * per-question options when offered), tells the model to end its turn, rejects a
 * batch over 3, and last-call-wins when asked twice.
 */

const askUser = makeAskUserTool();

// pi's tool.execute takes (id, params, signal, onUpdate, ctx); the last three
// are irrelevant here, so one helper supplies them.
const ctx = {} as unknown as ExtensionContext;
const run = (params: unknown) =>
  askUser.execute("id", params as never, undefined, undefined, ctx);

test("is named ask_user", () => {
  expect(askUser.name).toBe("ask_user");
  expect(ASK_USER_TOOL_NAME).toBe("ask_user");
});

test("records a single open question with a q1 id and ends the turn", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({ questions: [{ question: "What city are you in?" }] }),
  );
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [{ id: "q1", question: "What city are you in?" }],
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
});

test("batches up to three questions, assigning q1..qN ids and keeping options", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      questions: [
        { question: "What city are you in?" },
        {
          question: "Send it?",
          options: [
            { id: "yes", label: "Send" },
            { id: "no", label: "Cancel" },
          ],
        },
        { question: "Anything to add?" },
      ],
    }),
  );
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [
      { id: "q1", question: "What city are you in?" },
      {
        id: "q2",
        question: "Send it?",
        options: [
          { id: "yes", label: "Send" },
          { id: "no", label: "Cancel" },
        ],
      },
      { id: "q3", question: "Anything to add?" },
    ],
  });
});

test("an empty options array on a question is dropped (recorded as open)", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({ questions: [{ question: "Anything else?", options: [] }] }),
  );
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [{ id: "q1", question: "Anything else?" }],
  });
});

test("throws with merge/trim guidance when asked more than three questions", async () => {
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () =>
      run({
        questions: [
          { question: "one?" },
          { question: "two?" },
          { question: "three?" },
          { question: "four?" },
        ],
      }),
    ),
  ).rejects.toThrow(/1 to 3 questions/i);
  // Nothing recorded on the rejected call.
  expect(holder.pending).toBeUndefined();
});

test("throws when given no questions", async () => {
  await expect(run({ questions: [] })).rejects.toThrow(/1 to 3 questions/i);
});

test("last call wins when the model asks twice in a turn", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await run({ questions: [{ question: "first?" }] });
    await run({ questions: [{ question: "second?" }] });
  });
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [{ id: "q1", question: "second?" }],
  });
});
