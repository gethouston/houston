import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
} from "@anthropic-ai/claude-agent-sdk";
import type { WorkspaceGuardOptions } from "../../session/tools/fs-guard";
import { denyToolUse, fileGuardHook } from "./file-guard-hook";
import { buildTurnEndHooks } from "./turn-end-hook";

const TOOL_GATE_TIMEOUT_S = 600;
export const TOOL_GATE_DENY_AFTER_MS = (TOOL_GATE_TIMEOUT_S - 10) * 1000;

export type ToolGate = (
  toolName: string,
  toolInput: unknown,
  signal: AbortSignal,
) => Promise<void>;

export function toolGateHook(beforeTool: ToolGate): HookCallback {
  return async (input, _toolUseId, { signal }) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "The agent's files are still loading. Try this tool again in a moment, or continue without it.",
            ),
          ),
        TOOL_GATE_DENY_AFTER_MS,
      );
      const stopped = () => reject(new Error("the turn was stopped"));
      if (signal.aborted) stopped();
      else signal.addEventListener("abort", stopped, { once: true });
    });
    try {
      const call =
        "tool_name" in input
          ? beforeTool(input.tool_name, input.tool_input, signal)
          : Promise.resolve();
      await Promise.race([call, stop]);
      return {};
    } catch (error) {
      return denyToolUse(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface SessionHookOptions {
  workspaceDir: string;
  fileGuard?: WorkspaceGuardOptions;
  beforeTool?: ToolGate;
}

export function buildSessionHooks({
  workspaceDir,
  fileGuard,
  beforeTool,
}: SessionHookOptions): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const guard = fileGuardHook(workspaceDir, fileGuard);
  const gate = beforeTool ? toolGateHook(beforeTool) : undefined;
  const preToolUse: HookCallback = async (input, toolUseId, options) => {
    const held = gate ? await gate(input, toolUseId, options) : {};
    if ("hookSpecificOutput" in held) return held;
    return guard(input, toolUseId, options);
  };
  return {
    ...buildTurnEndHooks(),
    PreToolUse: [
      {
        hooks: [preToolUse],
        ...(gate ? { timeout: TOOL_GATE_TIMEOUT_S } : {}),
      },
    ],
  };
}
