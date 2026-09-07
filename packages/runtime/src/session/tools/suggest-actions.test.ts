import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import {
  makeSuggestActionsTool,
  SUGGEST_ACTIONS_TOOL_NAME,
} from "./suggest-actions";

const suggestActions = makeSuggestActionsTool();
const ctx = {} as unknown as ExtensionContext;
const run = (params: unknown) =>
  suggestActions.execute("id", params as never, undefined, undefined, ctx);
const actions = [
  { id: "draft", label: "Draft email", message: "Draft the email." },
  { id: "share", label: "Share update", message: "Share the update." },
];

test("is named suggest_actions", () => {
  expect(suggestActions.name).toBe("suggest_actions");
  expect(SUGGEST_ACTIONS_TOOL_NAME).toBe("suggest_actions");
});

test("the description states the call is required on non-blocking finishes", () => {
  const d = suggestActions.description ?? "";
  expect(d).toContain("Required on every turn you end without a blocking ask");
  expect(d).toContain("Skip it only when the turn ends blocked on the user");
  // The retired opt-out ("skip it if you can't name one") must not linger.
  expect(d).not.toContain("genuinely cannot name");
});

test("the description tells the model the call ends the turn, after the closing message", () => {
  const d = suggestActions.description ?? "";
  expect(d).toContain("This call ENDS your turn");
  expect(d).toContain("write the whole closing message first");
  expect(d).toContain("in the same final message as suggest_reusable");
  // The retired "then finish normally" contract must not linger.
  expect(d).not.toContain("then finish normally");
});

test("after a closing message it records the steps, marks the turn ended, and asks pi to terminate", async () => {
  const holder = newInteractionHolder();
  holder.finish.noteAssistantMessageStart();
  holder.finish.noteAssistantText("All set.");
  const out = await runWithInteractionCapture(holder, () => run({ actions }));
  expect(holder.pending).toEqual({
    steps: [{ kind: "suggest_actions", id: "a1", actions }],
  });
  expect(holder.finish.turnEndedByTool).toBe(true);
  expect(out.terminate).toBe(true);
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/This ended your turn/);
  expect(text).not.toMatch(/did NOT end/i);
});

test("before any visible text it records the steps but keeps the turn open and asks for the message", async () => {
  const holder = newInteractionHolder();
  holder.finish.noteAssistantMessageStart();
  holder.finish.noteAssistantText("\n\n");
  const out = await runWithInteractionCapture(holder, () => run({ actions }));
  expect(holder.pending).toEqual({
    steps: [{ kind: "suggest_actions", id: "a1", actions }],
  });
  expect(holder.finish.turnEndedByTool).toBe(false);
  expect(out.terminate).toBeUndefined();
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/did NOT end your turn/i);
  expect(text).toMatch(/write your short closing message now/i);
  expect(text).toMatch(/do not repeat/i);
});

test("trims action values before recording", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      actions: [
        { id: " draft ", label: " Draft ", message: " Draft it. " },
        { id: "share", label: " Share ", message: " Share it. " },
      ],
    }),
  );
  expect(holder.pending?.steps[0]).toMatchObject({
    actions: [
      { id: "draft", label: "Draft", message: "Draft it." },
      { id: "share", label: "Share", message: "Share it." },
    ],
  });
});

for (const key of ["id", "label", "message"] as const) {
  test(`throws on an empty or whitespace action ${key}`, async () => {
    const holder = newInteractionHolder();
    await expect(
      runWithInteractionCapture(holder, () =>
        run({ actions: [{ ...actions[0], [key]: "  " }, actions[1]] }),
      ),
    ).rejects.toThrow(/non-empty/i);
    expect(holder.pending).toBeUndefined();
  });
}

test("throws on duplicate action ids", async () => {
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () =>
      run({
        actions: [{ ...actions[0] }, { ...actions[1], id: actions[0].id }],
      }),
    ),
  ).rejects.toThrow(/unique/i);
  expect(holder.pending).toBeUndefined();
});

test("recording outside a turn is a no-op but returns the instruction", async () => {
  const out = await run({ actions });
  expect((out.content[0] as { text: string }).text).toMatch(
    /Houston will show/i,
  );
});
