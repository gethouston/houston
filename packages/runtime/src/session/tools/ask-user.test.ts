import { type ToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { z } from "zod";
import { toZodShape } from "../../backends/claude/schema-to-zod";
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
const ctx = {} as unknown as ExtensionToolContext;
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

test("threads a per-question toolkit slug onto the recorded question step", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      questions: [
        {
          question: "Should I send the 30 invites?",
          toolkit: "gmail",
          options: [
            { id: "send", label: "Send it", recommended: true },
            { id: "no", label: "Don't send" },
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
        question: "Should I send the 30 invites?",
        toolkit: "gmail",
        options: [
          { id: "send", label: "Send it", recommended: true },
          { id: "no", label: "Don't send" },
        ],
      },
    ],
  });
});

test("a question with no toolkit records no toolkit key (most questions)", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({ questions: [{ question: "Which week?" }] }),
  );
  expect(holder.pending).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Which week?" }],
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

test("threads wantsFiles onto a question answered with a file", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      questions: [
        { question: "Send me the character's image", wantsFiles: true },
        { question: "Which pose?", wantsFiles: false },
      ],
    }),
  );
  // Only `true` is recorded: a plain question carries no key.
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Send me the character's image",
        wantsFiles: true,
      },
      { kind: "question", id: "q2", question: "Which pose?" },
    ],
  });
});

// `execute` above takes the params as given; a model's call reaches it only
// after its backend validates the arguments against the tool's schema: pi's
// TypeBox validation, or the Claude backend's zod shape converted from it.
const call = (wantsFiles?: unknown) => ({
  questions: [
    {
      question: "Send me your logo",
      ...(wantsFiles === undefined ? {} : { wantsFiles }),
    },
  ],
});

const recorded = async (params: unknown) => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () => run(params));
  return holder.pending?.steps[0];
};

test("pi's schema validation carries wantsFiles through and refuses a non-boolean", async () => {
  const validate = (args: unknown) =>
    validateToolArguments(askUser, {
      type: "toolCall",
      id: "c1",
      name: ASK_USER_TOOL_NAME,
      arguments: args as ToolCall["arguments"],
    });
  expect(await recorded(validate(call()))).not.toHaveProperty("wantsFiles");
  expect(await recorded(validate(call(true)))).toMatchObject({
    wantsFiles: true,
  });
  expect(() => validate(call("maybe"))).toThrow(/wantsFiles/);
});

test("the Claude backend's converted schema carries wantsFiles through and refuses a non-boolean", async () => {
  const schema = z.object(toZodShape(askUser.parameters));
  const parse = (args: unknown) => schema.parse(args);
  expect(await recorded(parse(call()))).not.toHaveProperty("wantsFiles");
  expect(await recorded(parse(call(true)))).toMatchObject({
    wantsFiles: true,
  });
  expect(schema.safeParse(call("maybe")).success).toBe(false);
});

test.each([
  "pi",
  "Claude",
])("%s schema preserves option descriptions on the recorded interaction", async (backend) => {
  const args = {
    questions: [
      {
        question: "Which chat?",
        options: [
          {
            id: "new",
            label: "A new chat for each email",
            description: "Each email has its own conversation.",
          },
        ],
      },
    ],
  };
  const parsed =
    backend === "Claude"
      ? z.object(toZodShape(askUser.parameters)).parse(args)
      : validateToolArguments(askUser, {
          type: "toolCall",
          id: "c1",
          name: ASK_USER_TOOL_NAME,
          arguments: args,
        });
  expect(await recorded(parsed)).toMatchObject({
    options: args.questions[0].options,
  });
});
