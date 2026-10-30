import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import type { TurnSessionRequest } from "../../turn/turn-session-types";
import { buildTurnCommonTools } from "../../turn/turn-toolset";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import {
  makeSuggestReusableTool,
  SUGGEST_REUSABLE_TOOL_NAME,
} from "./suggest-reusable";

/**
 * The execute/auto reusable-suggestion tool. These pin: the tool records the
 * single suggest-reusable step (id `r1`), trims title/rationale, rejects an
 * empty title or rationale, returns the do-not-repeat-and-finish-normally
 * instruction (NOT an end-your-turn block), and is a no-op outside a turn.
 */

const suggestReusable = makeSuggestReusableTool();

// pi's tool.execute takes (id, params, signal, onUpdate, ctx); the last three
// are irrelevant here, so one helper supplies them.
const ctx = {} as unknown as ExtensionToolContext;
const run = (params: unknown) =>
  suggestReusable.execute("id", params as never, undefined, undefined, ctx);

test("is named suggest_reusable", () => {
  expect(suggestReusable.name).toBe("suggest_reusable");
  expect(SUGGEST_REUSABLE_TOOL_NAME).toBe("suggest_reusable");
});

test("before any visible text it records the r1 step but does NOT end the turn", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({
      reusableKind: "skill",
      title: "Weekly sales summary",
      rationale: "Saves you rebuilding it every Monday.",
    }),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly sales summary",
        rationale: "Saves you rebuilding it every Monday.",
      },
    ],
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/did NOT end your turn/i);
  expect(text).toMatch(/never sees your reasoning or tool results/i);
  expect(text).toMatch(/they have read nothing from you/i);
  expect(text).toMatch(/do not repeat the suggestion/i);
  expect(out.terminate).toBeUndefined();
  expect(holder.finish.turnEndedByTool).toBe(false);
});

test("after visible text in an earlier message it quotes that text back", async () => {
  const holder = newInteractionHolder();
  holder.finish.noteAssistantMessageStart();
  holder.finish.noteAssistantText("Here is your weekly summary.");
  holder.finish.noteAssistantMessageStart();
  const out = await runWithInteractionCapture(holder, () =>
    run({ reusableKind: "skill", title: "Weekly", rationale: "Recurs." }),
  );
  expect(out.terminate).toBeUndefined();
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain(
    "<read_by_user>\nHere is your weekly summary.\n</read_by_user>",
  );
});

test("after the closing message it ends the turn like suggest_actions", async () => {
  const holder = newInteractionHolder();
  holder.finish.noteAssistantMessageStart();
  holder.finish.noteAssistantText("Done.");
  const out = await runWithInteractionCapture(holder, () =>
    run({ reusableKind: "routine", title: "Weekly", rationale: "Recurs." }),
  );
  expect(holder.pending?.steps[0]).toMatchObject({ kind: "suggest_reusable" });
  expect(out.terminate).toBe(true);
  expect(holder.finish.turnEndedByTool).toBe(true);
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/This ended your turn/);
});

test("the description pairs it with suggest_actions only when that tool is on", () => {
  const d = suggestReusable.description ?? "";
  expect(d).toContain(
    "If you have suggest_actions, call both in that same message.",
  );
  expect(d).toContain("It ends your turn");
  expect(d).not.toContain("This does not end your turn");
});

test("with suggestions off or on, a turn's tools offer to save the work without ordering suggest_actions", async () => {
  for (const nextStepSuggestions of [false, true]) {
    const tools = buildTurnCommonTools(
      { nextStepSuggestions } as TurnSessionRequest,
      null,
      "/tmp/data",
    );
    const names = tools.map((t) => t.name);
    expect(names).toContain("suggest_reusable");
    expect(names.includes("suggest_actions")).toBe(nextStepSuggestions);
  }
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({ reusableKind: "skill", title: "T", rationale: "R" }),
  );
  expect((out.content[0] as { text: string }).text).toContain(
    "Write your closing message now, then end (calling suggest_actions with it only if you have that tool).",
  );
});

test("carries the routine kind through unchanged", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      reusableKind: "routine",
      title: "Morning digest",
      rationale: "Runs on its own each day.",
    }),
  );
  expect(holder.pending?.steps[0]).toMatchObject({
    kind: "suggest_reusable",
    reusableKind: "routine",
  });
});

test("carries the learning kind through unchanged", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      reusableKind: "learning",
      title: "Preferred report format",
      rationale: "You always want the summary first.",
    }),
  );
  expect(holder.pending?.steps[0]).toMatchObject({
    kind: "suggest_reusable",
    reusableKind: "learning",
  });
});

test("trims the title and rationale before recording", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({
      reusableKind: "skill",
      title: "   Book the trip   ",
      rationale: "   Reuse the whole flow next time.   ",
    }),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Book the trip",
        rationale: "Reuse the whole flow next time.",
      },
    ],
  });
});

test("throws on an empty / whitespace title and records nothing", async () => {
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () =>
      run({ reusableKind: "skill", title: "   ", rationale: "why" }),
    ),
  ).rejects.toThrow(/non-empty title/i);
  expect(holder.pending).toBeUndefined();
});

test("throws on an empty / whitespace rationale and records nothing", async () => {
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () =>
      run({ reusableKind: "routine", title: "A title", rationale: "   " }),
    ),
  ).rejects.toThrow(/non-empty rationale/i);
  expect(holder.pending).toBeUndefined();
});

test("recording outside a turn is a no-op but still returns the instruction", async () => {
  const out = await run({
    reusableKind: "skill",
    title: "Orphan skill",
    rationale: "No turn around it.",
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/The app will show/i);
});
