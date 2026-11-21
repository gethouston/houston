import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { Type } from "typebox";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "../../auth/credential-store";
import { SentRequests } from "../../backends/pi/model-phase";
import { PiSession } from "../../backends/pi/session";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { makeSuggestActionsTool } from "./suggest-actions";
import { makeSuggestReusableTool } from "./suggest-reusable";

const actions = [
  { id: "review", label: "Review it", message: "Review the result." },
  { id: "extend", label: "Extend it", message: "Extend the result." },
];
const reusable = {
  reusableKind: "skill",
  title: "Weekly brief",
  rationale: "Reusable.",
};

const lookupTool = defineTool({
  name: "lookup",
  label: "Lookup",
  description: "Look something up.",
  parameters: Type.Object({}),
  async execute() {
    return { content: [{ type: "text" as const, text: "found" }], details: {} };
  },
});

async function fauxSession(responses: AssistantMessage[]) {
  const cwd = mkdtempSync(join(tmpdir(), "houston-suggest-actions-"));
  const faux = fauxProvider({
    provider: "faux",
    api: "faux",
    models: [
      { id: "faux-1", name: "Faux 1", contextWindow: 200000, maxTokens: 8192 },
    ],
  });
  faux.setResponses(responses);
  const authStorage = new HoustonAuthStore(join(cwd, "auth.json"));
  authStorage.set("faux", { type: "api_key", key: "faux-key" });
  const modelRuntime = await ModelRuntime.create({
    credentials: authStorage,
    modelsPath: join(cwd, "models.json"),
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    modelRuntime,
    model: faux.getModel() as never,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ retry: { baseDelayMs: 0 } }),
    tools: ["suggest_actions", "suggest_reusable", "lookup"],
    customTools: [
      makeSuggestActionsTool(),
      makeSuggestReusableTool(),
      lookupTool,
    ],
  });
  const wrapped = new PiSession(session, new SentRequests());
  const holder = newInteractionHolder();
  const events: WireEvent[] = [];
  wrapped.subscribeAssistantMessageStart(() =>
    holder.finish.noteAssistantMessageStart(),
  );
  wrapped.subscribe((e) => {
    events.push(e);
    if (e.type === "text") holder.finish.noteAssistantText(e.data);
  });
  const prompt = (text: string) =>
    runWithInteractionCapture(holder, () => wrapped.prompt(text));
  return { faux, prompt, holder, events };
}

const textOf = (events: WireEvent[]) =>
  events
    .filter((e): e is Extract<WireEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.data)
    .join("");

test("closing message + suggest_actions in one assistant message ends the turn after ONE provider call", async () => {
  const { faux, prompt, holder, events } = await fauxSession([
    fauxAssistantMessage(
      [fauxText("All set."), fauxToolCall("suggest_actions", { actions })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("A second message the user must never see"),
  ]);
  await prompt("do the thing");
  expect(faux.state.callCount).toBe(1);
  expect(textOf(events)).toBe("All set.");
  expect(holder.finish.turnEndedByTool).toBe(true);
  expect(holder.pending).toEqual({
    steps: [{ kind: "suggest_actions", id: "a1", actions }],
  });
  const toolEnd = events.find((e) => e.type === "tool_end");
  expect(toolEnd).toMatchObject({ data: { isError: false } });
});

test("both offers in the final message end the turn together, in one call", async () => {
  const { faux, prompt, holder, events } = await fauxSession([
    fauxAssistantMessage(
      [
        fauxText("All set."),
        fauxToolCall("suggest_reusable", reusable),
        fauxToolCall("suggest_actions", { actions }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("never requested"),
  ]);
  await prompt("do the thing");
  expect(faux.state.callCount).toBe(1);
  expect(textOf(events)).toBe("All set.");
  expect(holder.pending?.steps.map((s) => s.kind)).toEqual([
    "suggest_actions",
    "suggest_reusable",
  ]);
  expect(
    events.filter((e) => e.type === "tool_end").map((e) => e.data.isError),
  ).toEqual([false, false]);
});

test("suggest_actions before any visible text keeps the turn open for the closing message", async () => {
  const { faux, prompt, holder, events } = await fauxSession([
    fauxAssistantMessage([fauxToolCall("suggest_actions", { actions })], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Here is the reply."),
  ]);
  await prompt("do the thing");
  expect(faux.state.callCount).toBe(2);
  expect(textOf(events)).toBe("Here is the reply.");
  expect(holder.finish.turnEndedByTool).toBe(false);
  expect(holder.pending).toEqual({
    steps: [{ kind: "suggest_actions", id: "a1", actions }],
  });
});

test("text from an earlier round-trip of the turn is not the closing message of a later call", async () => {
  const { faux, prompt, holder, events } = await fauxSession([
    fauxAssistantMessage(
      [fauxText("Looking that up."), fauxToolCall("lookup", {})],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxToolCall("suggest_actions", { actions })], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Final reply."),
  ]);
  await prompt("do the thing");
  expect(faux.state.callCount).toBe(3);
  expect(textOf(events)).toContain("Final reply.");
  expect(holder.finish.turnEndedByTool).toBe(false);
});
