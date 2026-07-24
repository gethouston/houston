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
 * Composio-unaware — and rendered as the logo (in the helmet's icon slot)
 * followed by `{name} · {actionLabel}`. A missing `logoUrl` falls back to the
 * Houston helmet, never a broken image.
 */
export interface ChatActionBrand {
  name: string;
  logoUrl?: string;
  actionLabel: string;
}

export interface ChatProcessLabels {
  /**
   * Shimmer label while the mission runs but hasn't reached its first tool yet
   * (the opening planning / reasoning). e.g. "Thinking..."
   */
  active?: string;
  /** Settled label once the mission ends and the log collapses. e.g. "Mission log". */
  complete?: string;
  /**
   * Resolves a Composio action slug (e.g. `GMAIL_SEND_EMAIL`) to the app's
   * presentational brand for the branded header row. App-supplied (the catalog
   * lives app-side); returns `undefined` when the current tool isn't a
   * resolvable integration action, and the header falls back to the plain tool
   * verb. Read-only — no connect side effects.
   */
  resolveActionBrand?: (action: string) => ChatActionBrand | undefined;
}

const DEFAULTS = {
  active: "Thinking...",
  complete: "Mission log",
};

/**
 * Name of the tool that names the current step of an active process: the most
 * recently invoked tool, i.e. the last tool of the last segment that has any.
 *
 * It is deliberately "most recent" rather than "still running": local tools
 * (Read/Edit/Grep) finish in well under a second, but the agent spends most of
 * the turn reasoning between them. Keying off the running window alone left the
 * header on the bare "Thinking..." fallback almost the whole time
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
 * The single status line's text. While active it names the current tool in
 * present tense ("Reading file"); before the first tool runs it reads the
 * active "Thinking..." label; once settled it reads the complete label. It
 * never mentions how many tools ran.
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
  return getToolActionLabel(name, false, toolLabels);
}

/**
 * The header content and its left-icon intent, picked purely so the component
 * only reads the `kind`:
 * - `brand` — the current tool is a resolvable `integration_execute`: the app
 *   logo replaces the helmet + `{name} · {actionLabel}`.
 * - `tool` — any other running tool: `toolName` lets the component reuse the
 *   mission-log per-tool icon (helmet when the name isn't mapped) + the verb.
 * - `text` — helmet + label: the active "Thinking..." gap and the settled
 *   "Mission log".
 */
export type ProcessHeader =
  | { kind: "brand"; brand: ChatActionBrand }
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
      if (labels?.resolveActionBrand) {
        const action = integrationActionOf(tool);
        if (action) {
          const brand = labels.resolveActionBrand(action);
          if (brand) return { kind: "brand", brand };
        }
      }
      return {
        kind: "tool",
        label: buildProcessHeaderLabel(opts),
        toolName: tool.name,
      };
    }
  }
  return { kind: "text", label: buildProcessHeaderLabel(opts) };
}
