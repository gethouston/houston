import { TOOL_GATE_DENY_AFTER_MS } from "../backends/claude/tool-gate-hook";
import type { PiBackendDeps } from "../backends/pi/backend";
import type { FileSnapshot } from "../session/file-changes";
import { TurnSetupError } from "./turn-layout";
import { captureWorkspaceSnapshot } from "./turn-session-success";

type TurnTool = PiBackendDeps["customTools"][number];

export { deferredWorkspaceFile } from "./turn-deferred-rule";

export async function awaitDeferredFiles(
  ready: Promise<void> | undefined,
  signal?: AbortSignal,
  deadlineMs: number = TOOL_GATE_DENY_AFTER_MS,
): Promise<void> {
  if (!ready) return;
  const stop = signal ? abortion(signal) : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("the agent's files are still loading")),
      deadlineMs,
    );
  });
  try {
    await Promise.race([ready, late, ...(stop ? [stop.stopped] : [])]);
  } catch (error) {
    if (error instanceof TurnSetupError && error.code === "hydrate_over_cap")
      throw new Error(
        "The agent's files are too large to load in a conversation, so its tools cannot run. You can still answer without them.",
        { cause: error },
      );
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The agent's files did not load for this turn (${detail}), so its tools cannot run. Ask the user to send the message again.`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
    stop?.dispose();
  }
}

function abortion(signal: AbortSignal) {
  let onAbort: () => void = () => undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("the turn was stopped"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    stopped,
    dispose: () => signal.removeEventListener("abort", onAbort),
  };
}

export function gateTurnTools(
  tools: TurnTool[],
  ready: Promise<void> | undefined,
): TurnTool[] {
  if (!ready) return tools;
  return tools.map((tool) => ({
    ...tool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      await awaitDeferredFiles(ready, signal);
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  }));
}

export function snapshotWhenReady(
  workspaceDir: string,
  ready: Promise<void> | undefined,
): Promise<FileSnapshot | null> {
  if (!ready) return Promise.resolve(captureWorkspaceSnapshot(workspaceDir));
  return ready.then(
    () => captureWorkspaceSnapshot(workspaceDir),
    () => null,
  );
}
