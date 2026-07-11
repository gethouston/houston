import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { ASK_USER_TOOL_NAME, makeAskUserTool } from "./ask-user";

/**
 * The always-available blocking-question tool. These pin: the tool assigns
 * `q1`..`qN` ids and records the question STEPS of the turn's interaction
 * sequence (with per-question options when offered), tells the model to end its
 * turn, rejects a batch over 3, and REPLACES the questions when asked twice.
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
    steps: [{ kind: "question", id: "q1", question: "What city are you in?" }],
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
    steps: [
      { kind: "question", id: "q1", question: "What city are you in?" },
      {
        kind: "question",
        id: "q2",
        question: "Send it?",
        options: [
          { id: "yes", label: "Send" },
          { id: "no", label: "Cancel" },
        ],
      },
      { kind: "question", id: "q3", question: "Anything to add?" },
    ],
  });
});

test("passes through per-option description and recommended onto the question step", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({
      questions: [
        {
          question: "Which plan?",
          options: [
            {
              id: "pro",
              label: "Pro",
              description: "Unlocks everything.",
              recommended: true,
            },
            { id: "free", label: "Free" },
          ],
        },
      ],
    }),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Which plan?",
        options: [
          {
            id: "pro",
            label: "Pro",
            description: "Unlocks everything.",
            recommended: true,
          },
          { id: "free", label: "Free" },
        ],
      },
    ],
  });
  const details = out.details as {
    questions: {
      options?: { description?: string; recommended?: boolean }[];
    }[];
  };
  expect(details.questions[0].options?.[0]).toMatchObject({
    description: "Unlocks everything.",
    recommended: true,
  });
});

test("an empty options array on a question is dropped (recorded as open)", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({ questions: [{ question: "Anything else?", options: [] }] }),
  );
  expect(holder.pending).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Anything else?" }],
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

test("a second ask_user call replaces the questions of the first", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await run({ questions: [{ question: "first?" }] });
    await run({ questions: [{ question: "second?" }] });
  });
  expect(holder.pending).toEqual({
    steps: [{ kind: "question", id: "q1", question: "second?" }],
  });
});
