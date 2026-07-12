import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
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
const ctx = {} as unknown as ExtensionContext;
const run = (params: unknown) =>
  suggestReusable.execute("id", params as never, undefined, undefined, ctx);

test("is named suggest_reusable", () => {
  expect(suggestReusable.name).toBe("suggest_reusable");
  expect(SUGGEST_REUSABLE_TOOL_NAME).toBe("suggest_reusable");
});

test("records the suggest-reusable step with an r1 id and does NOT end the turn", async () => {
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
  expect(text).toMatch(/do not repeat/i);
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
  expect(text).toMatch(/Houston will show/i);
});
