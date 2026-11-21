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

export function toolGateHook(beforeTool: () => Promise<void>): HookCallback {
  return async (_input, _toolUseId, { signal }) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("the agent's files are still loading")),
        TOOL_GATE_DENY_AFTER_MS,
      );
      const stopped = () => reject(new Error("the turn was stopped"));
      if (signal.aborted) stopped();
      else signal.addEventListener("abort", stopped, { once: true });
    });
    try {
      await Promise.race([beforeTool(), stop]);
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
  beforeTool?: () => Promise<void>;
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
