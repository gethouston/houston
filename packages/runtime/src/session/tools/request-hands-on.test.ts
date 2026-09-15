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

const tool = makeRequestHandsOnTool({ personalAssistant: false });
const managerTool = makeRequestHandsOnTool({ personalAssistant: true });
const run = (
  which: typeof tool,
  surface: string,
  reason?: string,
): Promise<unknown> =>
  which.execute(
    "id",
    { surface, reason },
    undefined,
    undefined,
    {} as ExtensionContext,
  );
const execute = (surface: string, reason?: string) =>
  run(tool, surface, reason);
const asManager = (surface: string, reason?: string) =>
  run(managerTool, surface, reason);
/** The queued errands' screens. Read off `handsOn`, whose element type carries
 *  `surface`, rather than off the mixed-kind `pending.steps` union. */
const screens = (holder: ReturnType<typeof newInteractionHolder>) =>
  holder.handsOn.map((step) => step.surface);

test("errands are deduped by screen, keeping the first position", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await execute(" apiKeys ", "  Copy the key Houston shows once  ");
    await execute("routineWebhook", "Copy the webhook");
    // The same screen again is the SAME errand: the card's only job is to send
    // the person there, so a second one would be the same trip twice.
    await execute("routineWebhook", "Updated webhook reason");
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
      reason: "Updated webhook reason",
    },
  ]);
});

test("a screen Houston cannot open is refused where the model can correct it", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    for (const surface of [" ", "settings", "api_keys", "Billing"])
      await expect(execute(surface)).rejects.toThrow(
        "screen to hand over. Use one of: apiKeys, files, routineWebhook.",
      );
  });
  expect(holder.pending).toBeUndefined();
});

test("only the AI Manager may send the person to their money or their space", async () => {
  // The reason on the card is MODEL-authored text in Houston's own chrome, so
  // an ordinary agent that read a hostile page could dress a trip to Billing
  // as Houston's idea.
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    for (const surface of ["billing", "orgDanger"])
      await expect(execute(surface)).rejects.toThrow(
        "is the user's own to open, not yours to hand over",
      );
    expect(holder.pending).toBeUndefined();
    // The screens that are plainly the work, not the account, stay broad.
    for (const surface of ["apiKeys", "files", "routineWebhook"])
      await execute(surface);
  });
  expect(screens(holder)).toEqual(["apiKeys", "files", "routineWebhook"]);
});

test("the AI Manager keeps every screen, offered and accepted", async () => {
  expect(tool.description).not.toContain("billing");
  expect(managerTool.description).toContain("billing, ");
  expect(managerTool.description).toContain("orgDanger");
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await asManager("billing", "Only you can put a card on file.");
    await asManager("orgDanger");
    await asManager("apiKeys");
  });
  expect(screens(holder)).toEqual(["billing", "orgDanger", "apiKeys"]);
});

test("live Plan prevents errands, while auto permits them", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await expect(
      runWithTurnMode({ current: "plan" }, () => execute("files")),
    ).rejects.toThrow("Plan mode");
    expect(holder.pending).toBeUndefined();
    await runWithTurnMode({ current: "auto" }, () => execute("files"));
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

test("wire parser validates the screen and the optional reason structurally", () => {
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
    { ...valid, id: null },
  ])
    expect(isInteractionStep(malformed)).toBe(false);
});
