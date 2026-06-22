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
   * Shimmer label while the mission runs but hasn't reached its first tool yet
   * (the opening planning / reasoning). e.g. "Mission in progress..."
   */
  active?: string;
  /** Settled label once the mission ends and the log collapses. e.g. "Mission log". */
  complete?: string;
  /**
   * Formats the live header from the current action's human label. Owns the
   * localized "Mission in progress: {action}" template, so the colon-join and
   * punctuation stay correct per locale (the `active` label ends in "..." and
   * must not be naively concatenated). Defaults to English
   * `Mission in progress: ${action}`.
   */
  activeAction?: (action: string) => string;
}

const DEFAULTS = {
  active: "Mission in progress...",
  complete: "Mission log",
  activeAction: (action: string) => `Mission in progress: ${action}`,
};

/**
 * Name of the tool that names the current step of an active process: the most
 * recently invoked tool, i.e. the last tool of the last segment that has any.
 *
 * It is deliberately "most recent" rather than "still running": local tools
 * (Read/Edit/Grep) finish in well under a second, but the agent spends most of
 * the turn reasoning between them. Keying off the running window alone left the
 * header on the bare "Mission in progress..." fallback almost the whole time
 * (HOU-448 follow-up). Holding the latest tool's label for the life of the
 * active turn keeps the concrete step visible; it updates the moment a new tool
 * starts and clears when the turn settles.
 */
export function getCurrentActionToolName(
  segments: ChatProcessSegment[],
): string | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    const tools = segments[i].tools;
    if (tools.length > 0) return tools[tools.length - 1].name;
  }
  return undefined;
}

/**
 * The single status line shown on the process-block trigger. While active it
 * surfaces the current action in present tense ("Mission in progress: Reading
 * file"); before the first tool runs it falls back to the bare active label;
 * once settled it reads the complete label. It never mentions how many tools ran.
 */
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
  const action = getToolActionLabel(name, false, toolLabels);
  return (labels?.activeAction ?? DEFAULTS.activeAction)(action);
}
