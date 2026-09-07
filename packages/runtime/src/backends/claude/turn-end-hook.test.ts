import type { PostToolBatchHookInput } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../../session/interaction";
import { makeSuggestActionsTool } from "../../session/tools/suggest-actions";
import { buildTurnEndHooks, endTurnIfRequested } from "./turn-end-hook";

/**
 * The Claude backend's answer to pi's `terminate` hint: a PostToolBatch hook
 * that stops the subprocess once a tool of the batch marked the turn ended.
 * These pin the hook's wiring and its decision: silent before the closing
 * message, silent outside a turn, `continue: false` after.
 */

const input = {
  hook_event_name: "PostToolBatch",
  tool_calls: [],
  session_id: "s",
  transcript_path: "/dev/null",
  cwd: "/",
} as unknown as PostToolBatchHookInput;
const fire = () =>
  endTurnIfRequested(input, undefined, {
    signal: new AbortController().signal,
  });
const actions = [
  { id: "a", label: "A", message: "Do A." },
  { id: "b", label: "B", message: "Do B." },
];
const callTool = () =>
  makeSuggestActionsTool().execute(
    "id",
    { actions },
    undefined,
    undefined,
    {} as never,
  );

test("the hooks option is one PostToolBatch hook on every batch", () => {
  const hooks = buildTurnEndHooks();
  expect(Object.keys(hooks)).toEqual(["PostToolBatch"]);
  expect(hooks.PostToolBatch).toEqual([{ hooks: [endTurnIfRequested] }]);
});

test("stops the subprocess only after an offer tool ended the turn", async () => {
  const holder = newInteractionHolder();
  holder.finish.noteAssistantMessageStart();
  holder.finish.noteAssistantText("All set.");
  await runWithInteractionCapture(holder, async () => {
    // Before the tool ran: nothing to stop.
    expect(await fire()).toEqual({});
    await callTool();
    expect(await fire()).toMatchObject({ continue: false });
  });
});

test("stays silent when the tool ran before any visible text", async () => {
  const holder = newInteractionHolder();
  holder.finish.noteAssistantMessageStart();
  await runWithInteractionCapture(holder, async () => {
    await callTool();
    expect(await fire()).toEqual({});
  });
});

test("stays silent outside a turn", async () => {
  expect(await fire()).toEqual({});
});
