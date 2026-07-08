import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { makePlanReadyTool, PLAN_READY_TOOL_NAME } from "./plan-ready";

/**
 * The plan-mode-only plan-presentation tool. These pin: the tool records the
 * single plan-ready step (id `p1`), trims the summary, rejects an empty summary,
 * returns the end-your-turn instruction, and is a no-op outside a turn.
 */

const planReady = makePlanReadyTool();

// pi's tool.execute takes (id, params, signal, onUpdate, ctx); the last three
// are irrelevant here, so one helper supplies them.
const ctx = {} as unknown as ExtensionContext;
const run = (params: unknown) =>
  planReady.execute("id", params as never, undefined, undefined, ctx);

test("is named plan_ready", () => {
  expect(planReady.name).toBe("plan_ready");
  expect(PLAN_READY_TOOL_NAME).toBe("plan_ready");
});

test("records the plan-ready step with a p1 id and ends the turn", async () => {
  const holder = newInteractionHolder();
  const out = await runWithInteractionCapture(holder, () =>
    run({ summary: "Draft the deck, then send it for review." }),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "plan_ready",
        id: "p1",
        summary: "Draft the deck, then send it for review.",
      },
    ],
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
});

test("trims the summary before recording", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    run({ summary: "   Book the flights and hotel.   " }),
  );
  expect(holder.pending).toEqual({
    steps: [
      { kind: "plan_ready", id: "p1", summary: "Book the flights and hotel." },
    ],
  });
});

test("throws on an empty / whitespace summary and records nothing", async () => {
  const holder = newInteractionHolder();
  await expect(
    runWithInteractionCapture(holder, () => run({ summary: "   " })),
  ).rejects.toThrow(/non-empty plan summary/i);
  expect(holder.pending).toBeUndefined();
});

test("recording outside a turn is a no-op but still returns the instruction", async () => {
  const out = await run({ summary: "A plan with no turn around it." });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toMatch(/end your turn/i);
});
