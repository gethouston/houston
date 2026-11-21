import type { ChatProcessSegment } from "./chat-process-groups";
import type { CommandActivity } from "./command-activity.ts";
import { commandActivityOf } from "./command-activity.ts";
import type { ToolEntry } from "./feed-to-messages";
import { getToolActionLabel, toolShortName } from "./tool-labels.ts";

export interface ChatActionBrand {
  name: string;
  logoUrl?: string;
  icon?: "tool";
  actionLabel: string;
  doneLabel?: string;
}

export interface ChatProcessLabels {
  active?: string;
  complete?: string;
  resolveActionBrand?: (action: string) => ChatActionBrand | undefined;
}

const DEFAULTS = {
  active: "Thinking...",
  complete: "Mission log",
};

export function getCurrentActionTool(
  segments: ChatProcessSegment[],
): ToolEntry | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    const tools = segments[i].tools;
    if (tools.length > 0) return tools[tools.length - 1];
  }
  return undefined;
}

export function getCurrentActionToolName(
  segments: ChatProcessSegment[],
): string | undefined {
  return getCurrentActionTool(segments)?.name;
}

export function integrationActionOf(tool: ToolEntry): string | undefined {
  if (toolShortName(tool.name) !== "integration_execute") return undefined;
  const input = tool.input;
  if (!input || typeof input !== "object") return undefined;
  const action = (input as { action?: unknown }).action;
  return typeof action === "string" && action.length > 0 ? action : undefined;
}

export function buildProcessHeaderLabel(opts: {
  isActive: boolean;
  segments: ChatProcessSegment[];
  labels?: ChatProcessLabels;
  toolLabels?: Record<string, string>;
}): string {
  const { isActive, segments, labels, toolLabels } = opts;
  if (!isActive) return labels?.complete ?? DEFAULTS.complete;
  const name = getCurrentActionToolName(segments);
  if (!name) return labels?.active ?? DEFAULTS.active;
  return getToolActionLabel(name, false, toolLabels);
}

export function activityLabel(activity: CommandActivity): string {
  if (activity.kind === "python") return "Python · Running code";
  return activity.host
    ? `Browsing the web · ${activity.host}`
    : "Browsing the web";
}

function toolRepeatKey(tool: ToolEntry): string {
  const action = integrationActionOf(tool);
  if (action) return `integration:${action}`;
  const activity = commandActivityOf(tool);
  if (activity) {
    return activity.kind === "web" ? `web:${activity.host ?? ""}` : "python";
  }
  return `tool:${toolShortName(tool.name).toLowerCase()}`;
}

export function countTrailingRepeats(segments: ChatProcessSegment[]): number {
  const tools = segments.flatMap((segment) => segment.tools);
  if (tools.length === 0) return 0;
  const key = toolRepeatKey(tools[tools.length - 1]);
  let count = 0;
  for (let i = tools.length - 1; i >= 0; i--) {
    if (toolRepeatKey(tools[i]) !== key) break;
    count++;
  }
  return count;
}

function repeatSuffix(count: number): string {
  return count > 1 ? ` x${count}` : "";
}

export type ProcessHeader =
  | { kind: "brand"; brand: ChatActionBrand; count: number }
  | { kind: "activity"; activity: CommandActivity; label: string }
  | { kind: "tool"; label: string; toolName: string }
  | { kind: "text"; label: string };

export function buildProcessHeader(opts: {
  isActive: boolean;
  segments: ChatProcessSegment[];
  labels?: ChatProcessLabels;
  toolLabels?: Record<string, string>;
}): ProcessHeader {
  const { isActive, segments, labels } = opts;
  if (isActive) {
    const tool = getCurrentActionTool(segments);
    if (tool) {
      const count = countTrailingRepeats(segments);
      if (labels?.resolveActionBrand) {
        const action = integrationActionOf(tool);
        if (action) {
          const brand = labels.resolveActionBrand(action);
          if (brand) return { kind: "brand", brand, count };
        }
      }
      const activity = commandActivityOf(tool);
      if (activity) {
        return {
          kind: "activity",
          activity,
          label: activityLabel(activity) + repeatSuffix(count),
        };
      }
      return {
        kind: "tool",
        label: buildProcessHeaderLabel(opts) + repeatSuffix(count),
        toolName: tool.name,
      };
    }
  }
  return { kind: "text", label: buildProcessHeaderLabel(opts) };
}
