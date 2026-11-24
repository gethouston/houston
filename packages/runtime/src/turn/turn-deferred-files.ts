import { join } from "node:path";
import { TOOL_GATE_DENY_AFTER_MS } from "../backends/claude/tool-gate-hook";
import type { PiBackendDeps } from "../backends/pi/backend";
import type { FileSnapshot } from "../session/file-changes";
import type { DeferredGate } from "./turn-deferred-gate";
import { type DeferredNeed, deferredNeed } from "./turn-deferred-tools";
import { partialTreeNotice } from "./turn-deferred-wait";
import { captureWorkspaceSnapshot } from "./turn-session-success";

type TurnTool = PiBackendDeps["customTools"][number];

export { deferredWorkspaceFile } from "./turn-deferred-rule";

export const WHOLE_TREE_WAIT_MS = 120_000;

const toldPartial = new WeakSet<DeferredGate>();

export async function awaitDeferredNeed(
  gate: DeferredGate,
  need: DeferredNeed,
  signal?: AbortSignal,
): Promise<void> {
  if (need.kind === "none") return;
  if (need.kind === "paths")
    return gate.waitForPaths(
      need.paths,
      signal,
      need.folder ? WHOLE_TREE_WAIT_MS : TOOL_GATE_DENY_AFTER_MS,
    );
  const settled = await gate.waitForAll(signal, WHOLE_TREE_WAIT_MS);
  if (settled.state !== "failed" || toldPartial.has(gate)) return;
  toldPartial.add(gate);
  throw partialTreeNotice(settled.error);
}

export function deferredToolGate(
  gate: DeferredGate,
  workspaceDir: string,
): (toolName: string, input: unknown, signal?: AbortSignal) => Promise<void> {
  return (toolName, input, signal) =>
    awaitDeferredNeed(
      gate,
      deferredNeed(toolName, input, workspaceDir),
      signal,
    );
}

export function deferredFileReady(
  filesystem: { deferredGate?: DeferredGate; workspaceDir: string },
  signal?: AbortSignal,
): { ready?: (rel: string) => Promise<void> } {
  const { deferredGate: gate, workspaceDir } = filesystem;
  if (!gate) return {};
  return {
    ready: (rel) =>
      gate.waitForPaths(
        [join(workspaceDir, ...rel.split("/"))],
        signal,
        TOOL_GATE_DENY_AFTER_MS,
      ),
  };
}

export function gateTurnTools(
  tools: TurnTool[],
  gate: DeferredGate | undefined,
  workspaceDir: string,
): TurnTool[] {
  if (!gate) return tools;
  const before = deferredToolGate(gate, workspaceDir);
  return tools.map((tool) => ({
    ...tool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      await before(tool.name, params, signal);
      return tool.execute(toolCallId, params, signal, onUpdate, ctx);
    },
  }));
}

export function snapshotWhenReady(
  workspaceDir: string,
  gate: DeferredGate | undefined,
): Promise<FileSnapshot | null> {
  return gate
    ? gate.beforeSnapshot(workspaceDir)
    : Promise.resolve(captureWorkspaceSnapshot(workspaceDir));
}
