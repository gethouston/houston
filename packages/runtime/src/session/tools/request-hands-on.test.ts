import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isInteractionStep, parsePendingInteraction } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  recordConnection,
  recordHandsOn,
  recordProviderConnection,
  recordQuestions,
  runWithInteractionCapture,
} from "../interaction";
import { runWithTurnMode } from "../turn-mode-context";
import { makeRequestHandsOnTool } from "./request-hands-on";

const tool = makeRequestHandsOnTool();
const execute = (surface: string, reason?: string, target?: string) =>
  tool.execute(
    "id",
    { surface, reason, target },
    undefined,
    undefined,
    {} as ExtensionContext,
  );

test("errands are deduped by screen AND target, keeping the first position", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await execute(" apiKeys ", "  Copy the key Houston shows once  ");
    await execute("routineWebhook", "Copy the webhook", "routine-7");
    // The same routine again is the SAME errand; a different one is its own.
    await execute("routineWebhook", "Updated reason", "routine-7");
    await execute("routineWebhook", "The nightly one", "routine-9");
    await execute("apiKeys", "Updated reason");
  });
  expect(holder.pending?.steps).toEqual([
    {
      kind: "hands_on",
      id: "h1",
      surface: "apiKeys",
      reason: "Updated reason",
    },
    {
      kind: "hands_on",
      id: "h2",
      surface: "routineWebhook",
      reason: "Updated reason",
      target: "routine-7",
    },
    {
      kind: "hands_on",
      id: "h3",
      surface: "routineWebhook",
      reason: "The nightly one",
      target: "routine-9",
    },
  ]);
});

test("a screen Houston cannot open is refused where the model can correct it", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    for (const surface of [" ", "settings", "api_keys", "Billing"])
      await expect(execute(surface)).rejects.toThrow(
        "screen to hand over. Use one of: apiKeys, billing, files, routineWebhook, orgDanger.",
      );
  });
  expect(holder.pending).toBeUndefined();
});

test("live Plan prevents errands, while auto permits them", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await expect(
      runWithTurnMode({ current: "plan" }, () => execute("billing")),
    ).rejects.toThrow("Plan mode");
    expect(holder.pending).toBeUndefined();
    await runWithTurnMode({ current: "auto" }, () => execute("billing"));
  });
  expect(holder.pending?.steps[0]?.kind).toBe("hands_on");
});

test("errands close the sequence and are turn scoped", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    // Queued FIRST, rendered LAST: a connection unblocks the agent's own work,
    // an errand on a screen only the person can operate does not.
    recordHandsOn({ surface: "files" });
    recordProviderConnection({ provider: "openai" });
    recordQuestions([{ kind: "question", id: "q1", question: "Which deck?" }]);
    recordConnection({ toolkit: "gmail" });
  });
  expect(holder.pending?.steps.map((step) => step.kind)).toEqual([
    "question",
    "connect",
    "provider_connect",
    "hands_on",
  ]);
  recordHandsOn({ surface: "billing" });
  expect(newInteractionHolder().pending).toBeUndefined();
  expect(holder.handsOn).toHaveLength(1);
});

test("wire parser validates the screen and the optional fields structurally", () => {
  const valid = {
    kind: "hands_on",
    id: "h1",
    surface: "orgDanger",
    reason: "Only you can delete this space.",
  };
  expect(parsePendingInteraction({ steps: [valid] })).toEqual({
    steps: [valid],
  });
  for (const malformed of [
    { ...valid, surface: "" },
    { ...valid, surface: 3 },
    { ...valid, reason: 3 },
    { ...valid, target: 3 },
    { ...valid, id: null },
  ])
    expect(isInteractionStep(malformed)).toBe(false);
});
