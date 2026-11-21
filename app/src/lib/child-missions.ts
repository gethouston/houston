import type { KanbanItem } from "@houston-ai/board";
import type { ChatMissionListItem, ChatMissionTone } from "@houston-ai/chat";
import { ARCHIVED_STATUS, DONE_STATUS } from "./mission-selection.ts";

export interface ChildMissionLabels {
  running: string;
  needsYou: string;
  done: string;
}

function toneOf(status: string): ChatMissionTone {
  if (status === "running") return "running";
  if (status === DONE_STATUS) return "done";
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
        lastMessageAt: item.lastMessageAt,
      };
    })
    .sort(
      (a, b) =>
        TONE_ORDER[a.tone] - TONE_ORDER[b.tone] ||
        b.lastMessageAt.localeCompare(a.lastMessageAt),
    )
    .map(({ lastMessageAt: _lastMessageAt, ...mission }) => mission);
}

const sessionKeyOfItem = (item: KanbanItem): string =>
  typeof item.metadata?.sessionKey === "string"
    ? item.metadata.sessionKey
    : `activity-${item.id}`;

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
