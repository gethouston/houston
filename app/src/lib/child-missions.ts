import type { KanbanItem } from "@houston-ai/board";
import type { ChatMissionListItem, ChatMissionTone } from "@houston-ai/chat";
// Explicit .ts extension: app/tests runs under node --experimental-strip-types,
// which does not resolve extensionless relative imports.
import { ARCHIVED_STATUS, DONE_STATUS } from "./mission-selection.ts";

/**
 * The missions one chat started (PRODUCT-1244), for the list above its
 * composer. A child is stamped with the parent's conversation id
 * (`origin_session_key`, server-side and unforgeable), which the board's item
 * builders carry through as `metadata.originSessionKey`.
 *
 * Ordering mirrors the board's own reading order — running first, then the ones
 * awaiting review, then closed — because a coordinator's question is always
 * "what is still in flight?". Within a group the most recently updated leads.
 * Archived children drop off exactly as they drop off the active board.
 */

export interface ChildMissionLabels {
  running: string;
  needsYou: string;
  done: string;
}

/** Board status → the three families the list renders. */
function toneOf(status: string): ChatMissionTone {
  if (status === "running") return "running";
  if (status === DONE_STATUS) return "done";
  // needs_you AND error: both park in the board's Needs you column, so the list
  // must not invent a fourth state the board doesn't show.
  return "attention";
}

const TONE_ORDER: Record<ChatMissionTone, number> = {
  running: 0,
  attention: 1,
  done: 2,
};

export function childMissionsOf(
  items: readonly KanbanItem[],
  parentSessionKey: string | null,
  labels: ChildMissionLabels,
): ChatMissionListItem[] {
  if (!parentSessionKey) return [];
  const label: Record<ChatMissionTone, string> = {
    running: labels.running,
    attention: labels.needsYou,
    done: labels.done,
  };
  return items
    .filter(
      (item) =>
        item.metadata?.originSessionKey === parentSessionKey &&
        item.status !== ARCHIVED_STATUS,
    )
    .map((item) => {
      const tone = toneOf(item.status);
      return {
        id: item.id,
        title: item.title,
        statusLabel: label[tone],
        tone,
        updatedAt: item.updatedAt,
      };
    })
    .sort(
      (a, b) =>
        TONE_ORDER[a.tone] - TONE_ORDER[b.tone] ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .map(({ updatedAt: _updatedAt, ...mission }) => mission);
}

/** A board item's chat address: its explicit session key, else the
 *  `activity-<id>` convention — the same fallback everything else uses. */
const sessionKeyOfItem = (item: KanbanItem): string =>
  typeof item.metadata?.sessionKey === "string"
    ? item.metadata.sessionKey
    : `activity-${item.id}`;

/**
 * The way back UP: when the OPEN chat is a mission the agent started, the
 * mission it was started from — the "Go to main mission" link's target.
 * Null when the open chat is not agent-started, or the parent is no longer on
 * the active board (archived/deleted — never render a dead link).
 */
export function parentMissionOf(
  items: readonly KanbanItem[],
  selectedSessionKey: string | null,
): { id: string; title: string } | null {
  if (!selectedSessionKey) return null;
  const self = items.find(
    (item) => sessionKeyOfItem(item) === selectedSessionKey,
  );
  const origin = self?.metadata?.originSessionKey;
  if (typeof origin !== "string" || !origin) return null;
  const parent = items.find((item) => sessionKeyOfItem(item) === origin);
  return parent ? { id: parent.id, title: parent.title } : null;
}
