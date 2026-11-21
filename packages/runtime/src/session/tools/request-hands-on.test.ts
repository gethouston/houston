import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
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

const tool = makeRequestHandsOnTool({
  personalAssistant: false,
  apiServed: true,
});
const managerTool = makeRequestHandsOnTool({
  personalAssistant: true,
  apiServed: true,
});
const desktopManagerTool = makeRequestHandsOnTool({
  personalAssistant: true,
  apiServed: false,
});
const run = (
  which: typeof tool,
  surface: string,
  reason?: string,
  agent?: string,
): Promise<unknown> =>
  which.execute(
    "id",
    { surface, reason, ...(agent === undefined ? {} : { agent }) },
    undefined,
    undefined,
    {} as ExtensionToolContext,
  );
const execute = (surface: string, reason?: string) =>
  run(tool, surface, reason);
const asManager = (surface: string, reason?: string) =>
  run(managerTool, surface, reason);
const screens = (holder: ReturnType<typeof newInteractionHolder>) =>
  holder.handsOn.map((step) => step.surface);

test("errands are deduped by screen, keeping the first position", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await execute(" apiKeys ", "  Copy the key Houston shows once  ");
    await execute("routineWebhook", "Copy the webhook");
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
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    for (const surface of ["billing", "orgDanger"])
      await expect(execute(surface)).rejects.toThrow(
        "is the user's own to open, not yours to hand over",
      );
    expect(holder.pending).toBeUndefined();
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

test("an employee's API access names that employee, and only the AI Manager hands it over", async () => {
  expect(managerTool.description).toContain("agentApiAccess");
  expect(managerTool.description).toContain("id from listAgents as agent");
  expect(managerTool.description).toContain(
    "apiKeys lets them create and copy a key right in the chat, and you never see it",
  );
  expect(managerTool.description).toContain("does the job right in the chat");
  expect(tool.description).not.toContain("agentApiAccess");
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await expect(
      run(tool, "agentApiAccess", undefined, "agent-1"),
    ).rejects.toThrow("only the user's AI Manager can look up which");
    for (const agent of [undefined, "", "   "])
      await expect(
        run(managerTool, "agentApiAccess", "Copy the prompt", agent),
      ).rejects.toThrow("pass that employee's id from listAgents as agent");
    expect(holder.pending).toBeUndefined();
    await run(managerTool, "agentApiAccess", "First", " agent-1 ");
    await run(managerTool, "agentApiAccess", "Second employee", "agent-2");
    await run(managerTool, "agentApiAccess", "Refreshed", "agent-1");
    await run(managerTool, "apiKeys", undefined, "agent-1");
  });
  expect(holder.pending?.steps).toEqual([
    {
      kind: "hands_on",
      id: "h1",
      surface: "agentApiAccess",
      agentId: "agent-1",
      reason: "Refreshed",
    },
    {
      kind: "hands_on",
      id: "h2",
      surface: "agentApiAccess",
      agentId: "agent-2",
      reason: "Second employee",
    },
    { kind: "hands_on", id: "h3", surface: "apiKeys" },
  ]);
});

test("without the Houston API there is no employee API access screen to hand over", async () => {
  expect(desktopManagerTool.description).not.toContain("agentApiAccess");
  expect(desktopManagerTool.description).toContain("orgDanger");
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await expect(
      run(desktopManagerTool, "agentApiAccess", undefined, "agent-1"),
    ).rejects.toThrow("does not offer the Houston API");
  });
  expect(holder.pending).toBeUndefined();
});

test("the description names no other company's product", () => {
  for (const which of [tool, managerTool, desktopManagerTool])
    for (const name of ["Claude Code", "Cursor", "ChatGPT", "Codex"])
      expect(which.description).not.toContain(name);
});
