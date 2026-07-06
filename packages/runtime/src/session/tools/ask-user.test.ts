import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { ASK_USER_TOOL_NAME, makeAskUserTool } from "./ask-user";

/**
 * The always-available blocking-question tool. These pin: the tool records a
 * `question` interaction on the turn's holder (with options when offered), tells
 * the model to end its turn, and last-call-wins when asked twice.
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

test("records an open question and instructs the model to end its turn", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({ question: "What city are you in?" }),
  );
  expect(holder.pending).toEqual({
    kind: "question",
    question: "What city are you in?",
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
});

test("records offered options for a choice/approval", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      question: "Send it?",
      options: [
        { id: "yes", label: "Send" },
        { id: "no", label: "Cancel" },
      ],
    }),
  );
  expect(holder.pending).toEqual({
    kind: "question",
    question: "Send it?",
    options: [
      { id: "yes", label: "Send" },
      { id: "no", label: "Cancel" },
    ],
  });
});

test("an empty options array is dropped (recorded as an open question)", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({ question: "Anything else?", options: [] }),
  );
  expect(holder.pending).toEqual({
    kind: "question",
    question: "Anything else?",
  });
});

test("last call wins when the model asks twice in a turn", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await run({ question: "first?" });
    await run({ question: "second?" });
  });
  expect(holder.pending).toEqual({ kind: "question", question: "second?" });
});
