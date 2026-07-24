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
import type { ToolEntry } from "./feed-to-messages";
import { getToolActionLabel, toolShortName } from "./tool-labels.ts";

/**
 * A resolved integration action for the header's branded row: the app's display
 * NAME, its LOGO (when the catalog carried one), and the humanized action in
 * present tense ("Sending email"). Resolved by the app — `ui/chat` stays
 * Composio-unaware — and rendered as `{name} · {actionLabel}` after the logo.
 * A missing `logoUrl` shows the name alone, never a broken image.
 */
export interface ChatActionBrand {
  name: string;
  logoUrl?: string;
  actionLabel: string;
}

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
  /**
   * The localized prefix for the BRANDED row ("Mission in progress:"), rendered
   * before the app logo + `{name} · {actionLabel}`. Split from `activeAction`
   * because the branded row interleaves an inline image, so the text can't be
   * one interpolated string. Keep the colon/wording per locale.
   */
  activeActionPrefix?: string;
  /**
   * Resolves a Composio action slug (e.g. `GMAIL_SEND_EMAIL`) to the app's
   * presentational brand for the branded header row. App-supplied (the catalog
   * lives app-side); returns `undefined` when the current tool isn't a
   * resolvable integration action, and the header falls back to the plain
   * `activeAction` string. Read-only — no connect side effects.
   */
  resolveActionBrand?: (action: string) => ChatActionBrand | undefined;
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
export function getCurrentActionTool(
  segments: ChatProcessSegment[],
): ToolEntry | undefined {
  for (let i = segments.length - 1; i >= 0; i--) {
    const tools = segments[i].tools;
    if (tools.length > 0) return tools[tools.length - 1];
  }
  return undefined;
}

/** The name of {@link getCurrentActionTool}, or undefined when no tool has run. */
export function getCurrentActionToolName(
  segments: ChatProcessSegment[],
): string | undefined {
  return getCurrentActionTool(segments)?.name;
}

/**
 * The Composio action slug of an `integration_execute` tool call, or undefined
 * for any other tool. The action lives in `input.action` (the entry may arrive
 * MCP-prefixed — `toolShortName` strips that). Tolerates a malformed input
 * (null, non-object, missing / non-string / empty `action`) by returning
 * undefined, so a half-streamed call never drives a branded row.
 */
export function integrationActionOf(tool: ToolEntry): string | undefined {
  if (toolShortName(tool.name) !== "integration_execute") return undefined;
  const input = tool.input;
  if (!input || typeof input !== "object") return undefined;
  const action = (input as { action?: unknown }).action;
  return typeof action === "string" && action.length > 0 ? action : undefined;
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

/**
 * The header content, either a resolved integration brand (the branded row) or
 * a plain string (every other case). While active, if the current tool is an
 * `integration_execute` AND the app's `resolveActionBrand` returns a value, the
 * branded row wins; otherwise this is `buildProcessHeaderLabel` verbatim. The
 * split keeps the decision pure and unit-testable, and the component only picks
 * a renderer off the `kind`.
 */
export type ProcessHeader =
  | { kind: "brand"; brand: ChatActionBrand }
  | { kind: "text"; label: string };

export function buildProcessHeader(opts: {
  isActive: boolean;
  segments: ChatProcessSegment[];
  labels?: ChatProcessLabels;
  toolLabels?: Record<string, string>;
}): ProcessHeader {
  const { isActive, segments, labels } = opts;
  if (isActive && labels?.resolveActionBrand) {
    const tool = getCurrentActionTool(segments);
    const action = tool ? integrationActionOf(tool) : undefined;
    if (action) {
      const brand = labels.resolveActionBrand(action);
      if (brand) return { kind: "brand", brand };
    }
  }
  return { kind: "text", label: buildProcessHeaderLabel(opts) };
}
