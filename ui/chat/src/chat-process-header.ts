/**
 * Pure logic for the chat "process" block's single header line — extracted from
 * `chat-process-block.tsx` (which is JSX) so it can be unit-tested under
 * `node:test` without a DOM, the way `chat-process-classes.ts` is.
 *
 * The header is the whole story while the log stays collapsed (HOU-448): it
 * surfaces only the one action in progress, never a count of how many tool
 * calls ran.
 */

import type { ChatProcessSegment } from "./chat-process-groups";
import { getToolActionLabel } from "./tool-labels.ts";

export interface ChatProcessLabels {
  /**
   * Shimmer label while the mission runs but no specific tool action is in
   * flight (reasoning-only, or between tool calls). e.g. "Mission in progress..."
   */
  active?: string;
  /** Settled label once the mission ends and the log collapses. e.g. "Mission log". */
  complete?: string;
  /**
   * Formats the live header when a tool action IS in flight, given that
   * action's human label. Owns the localized "Mission in progress: {action}"
   * template, so the colon-join and punctuation stay correct per locale (the
   * `active` label ends in "..." and must not be naively concatenated).
   * Defaults to English `Mission in progress: ${action}`.
   */
  activeAction?: (action: string) => string;
}

const DEFAULTS = {
  active: "Mission in progress...",
  complete: "Mission log",
  activeAction: (action: string) => `Mission in progress: ${action}`,
};

/**
 * Name of the tool currently executing in an active process block, if any: the
 * LAST tool of the LAST segment that has no result yet. Mirrors
 * `ToolsAndCards`' "isActive = last tool && !tool.result" rule so the header
 * action matches the shimmering in-pane row exactly.
 */
export function getActiveToolName(
  segments: ChatProcessSegment[],
): string | undefined {
  const last = segments[segments.length - 1];
  if (!last) return undefined;
  const tool = last.tools[last.tools.length - 1];
  return tool && !tool.result ? tool.name : undefined;
}

/**
 * The single status line shown on the process-block trigger. While active it
 * surfaces only the one in-progress action ("Mission in progress: Reading
 * file"); with no tool in flight it falls back to the bare active label; once
 * settled it reads the complete label. It never mentions how many tools ran.
 */
export function buildProcessHeaderLabel(opts: {
  isActive: boolean;
  segments: ChatProcessSegment[];
  labels?: ChatProcessLabels;
  toolLabels?: Record<string, string>;
}): string {
  const { isActive, segments, labels, toolLabels } = opts;
  if (!isActive) return labels?.complete ?? DEFAULTS.complete;
  const name = getActiveToolName(segments);
  if (!name) return labels?.active ?? DEFAULTS.active;
  const action = getToolActionLabel(name, false, toolLabels);
  return (labels?.activeAction ?? DEFAULTS.activeAction)(action);
}
