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

test("records action steps and returns the non-ending instruction", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () => run({ actions }));
  expect(holder.pending).toEqual({
    steps: [{ kind: "suggest_actions", id: "a1", actions }],
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/did NOT end your turn/i);
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
