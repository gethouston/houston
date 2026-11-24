import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  HookCallback,
  PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { buildSessionHooks, toolGateHook } from "./tool-gate-hook";
import { endTurnIfRequested } from "./turn-end-hook";

const input = {
  hook_event_name: "PreToolUse",
  tool_name: "Read",
  tool_input: { file_path: "uploads/photo.png" },
  session_id: "s",
  transcript_path: "/dev/null",
  cwd: "/",
} as unknown as PreToolUseHookInput;

const workspaceDir = realpathSync(mkdtempSync(join(tmpdir(), "tool-gate-")));
const SIGNAL = { signal: new AbortController().signal };

function preToolUse(hooks: ReturnType<typeof buildSessionHooks>): HookCallback {
  const hook = hooks.PreToolUse?.[0]?.hooks[0];
  if (!hook) throw new Error("no PreToolUse hook");
  return hook;
}

test("the workspace guard is always on; the gate's deadline only when gated", () => {
  const plain = buildSessionHooks({ workspaceDir });
  expect(Object.keys(plain).sort()).toEqual(["PostToolBatch", "PreToolUse"]);
  expect(plain.PostToolBatch).toEqual([{ hooks: [endTurnIfRequested] }]);
  expect(plain.PreToolUse?.[0]?.timeout).toBeUndefined();
  const gated = buildSessionHooks({
    workspaceDir,
    beforeTool: async () => undefined,
  });
  expect(gated.PreToolUse).toHaveLength(1);
  expect(gated.PreToolUse?.[0]?.timeout).toBe(600);
});

test("the guard judges only once the gate opens, and either one can deny", async () => {
  let open: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    open = resolve;
  });
  const hook = preToolUse(
    buildSessionHooks({ workspaceDir, beforeTool: () => ready }),
  );
  let answered = false;
  const answer = hook(input, "tool-1", SIGNAL).then((output) => {
    answered = true;
    return output;
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(answered).toBe(false);
  open();
  expect(await answer).toEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: { file_path: join(workspaceDir, "uploads", "photo.png") },
    },
  });

  const credential = {
    ...input,
    tool_input: { file_path: ".houston/runtime/auth.json" },
  } as PreToolUseHookInput;
  expect(await hook(credential, "tool-2", SIGNAL)).toMatchObject({
    hookSpecificOutput: { permissionDecision: "deny" },
  });

  const failing = preToolUse(
    buildSessionHooks({
      workspaceDir,
      beforeTool: async () => {
        throw new Error("uploads did not load");
      },
    }),
  );
  expect(await failing(input, "tool-3", SIGNAL)).toMatchObject({
    hookSpecificOutput: {
      permissionDecision: "deny",
      permissionDecisionReason: "uploads did not load",
    },
  });
});

test("a tool call waits for the gate, then proceeds untouched", async () => {
  let open: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    open = resolve;
  });
  let answered = false;
  const answer = toolGateHook(() => ready)(input, "tool-1", {
    signal: new AbortController().signal,
  }).then((output) => {
    answered = true;
    return output;
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(answered).toBe(false);
  open();
  expect(await answer).toEqual({});
});

test("a failed gate or a stopped turn denies the call with its reason", async () => {
  const failed = await toolGateHook(async () => {
    throw new Error("uploads did not load");
  })(input, "tool-1", { signal: new AbortController().signal });
  expect(failed).toEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "uploads did not load",
    },
  });

  const abort = new AbortController();
  abort.abort();
  const stopped = await toolGateHook(() => new Promise<void>(() => undefined))(
    input,
    "tool-1",
    { signal: abort.signal },
  );
  expect(stopped).toMatchObject({
    hookSpecificOutput: { permissionDecision: "deny" },
  });
});

test("the gate is told which tool is asking and with what input", async () => {
  const asked: unknown[] = [];
  const output = await toolGateHook(async (name, toolInput) => {
    asked.push(name, toolInput);
  })(input, "tool-1", { signal: new AbortController().signal });
  expect(output).toEqual({});
  expect(asked).toEqual(["Read", { file_path: "uploads/photo.png" }]);
});
