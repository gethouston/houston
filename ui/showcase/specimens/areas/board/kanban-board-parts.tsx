import { KanbanBoard, type KanbanItem } from "@houston-ai/board";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { storeSurface, storeType } from "@houston-ai/store";
import { Inbox } from "lucide-react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { AGENT_ICON, COLUMNS, MISSIONS } from "./sample";

/**
 * The board's live drag demo, its empty state, and its props table. Helper
 * module: it exports no `specimen`.
 */

/** The board's own height context — it is a `flex-1` row inside a pane. */
const BOARD_FRAME = "flex h-96 w-full flex-col rounded-xl bg-background";

/**
 * A real board with a real drag: pick a card up and drop it on another
 * section and `onItemMove` rewrites its status here, exactly as the app's
 * board source does. The columns a card may land on come from
 * `defaultCanDropItem` — any section that does not already hold its status.
 */
export function DraggableBoard() {
  const [items, setItems] = useState<KanbanItem[]>(MISSIONS);
  return (
    <div className={BOARD_FRAME}>
      <KanbanBoard
        columns={COLUMNS}
        items={items}
        avatar={AGENT_ICON}
        onSelect={() => {}}
        onItemMove={(moved, toColumnId) => {
          const target = COLUMNS.find((one) => one.id === toColumnId);
          if (!target) return;
          setItems((current) =>
            current.map((one) =>
              one.id === moved.id
                ? { ...one, status: target.statuses[0] }
                : one,
            ),
          );
        }}
      />
    </div>
  );
}

/** No missions yet: the board hands its whole area to the consumer's node. */
export function EmptyBoard() {
  return (
    <div className={BOARD_FRAME}>
      <KanbanBoard
        columns={COLUMNS}
        items={[]}
        onSelect={() => {}}
        emptyState={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>No missions yet</EmptyTitle>
              <EmptyDescription>
                Ask Inbox Zero for something and it shows up here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    </div>
  );
}

/** The four roles a column can play for the card in flight. */
const ROLES = [
  ["idle", "Nothing is being dragged."],
  [
    "origin",
    "The card's own section. No highlight, and the grab cursor stays.",
  ],
  [
    "drop-target",
    "Accepts the move: faint ring, stronger once under the pointer.",
  ],
  ["forbidden", "Rejects the move, so the cursor turns to not-allowed."],
] as const;

export function DragRoles() {
  return (
    <div className="flex flex-col gap-2">
      {ROLES.map(([role, meaning]) => (
        <div key={role} className="flex flex-wrap items-center gap-3">
          <code className={`${storeSurface.chip} font-mono`}>{role}</code>
          <span className={storeType.meta}>{meaning}</span>
        </div>
      ))}
    </div>
  );
}

export const BOARD_PROPS: SpecimenProp[] = [
  {
    name: "columns",
    type: "KanbanColumn[]",
    note: "Each names the statuses it holds; the board buckets `items` by them.",
  },
  {
    name: "items",
    type: "KanbanItem[]",
    note: "Every mission, unbucketed. Sorted newest-first inside each column.",
  },
  {
    name: "selectedId / highlightedId",
    type: "string | null",
    note: "The open card, and the one arrow-key navigation sits on.",
  },
  {
    name: "onSelect / onDelete / onApprove / onRename",
    type: "(item: KanbanItem) => void",
    note: "Forwarded to every card. Omitting one hides its button.",
  },
  {
    name: "emptyState",
    type: "React.ReactNode",
    note: "Replaces the whole board when `items` is empty.",
  },
  {
    name: "renderCard",
    type: "(item: KanbanItem) => React.ReactNode",
    note: "Replaces KanbanCard everywhere on the board.",
  },
  {
    name: "runningStatuses / approveStatuses / errorStatuses",
    type: "string[]",
    note: "The card's status vocabulary, passed straight through.",
  },
  {
    name: "selectable / selectedIds / onToggleSelect",
    type: "boolean | ReadonlySet<string> | (item) => void",
    note: "Multi-select. An active selection suspends dragging.",
  },
  {
    name: "selectionLockColumnId",
    type: "string | null",
    note: "Only this column stays selectable, so a selection cannot span sections.",
  },
  {
    name: "onItemMove",
    type: "(item: KanbanItem, toColumnId: string) => void",
    note: "Passing it is what enables drag-and-drop. Called on a valid drop.",
  },
  {
    name: "canDropItem",
    type: "(item: KanbanItem, toColumnId: string) => boolean",
    note: "Overrides `defaultCanDropItem` — any column not already holding the status.",
  },
];
