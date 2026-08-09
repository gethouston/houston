import {
  type BoardSearchSnippet,
  KanbanList,
  KanbanListItem,
} from "@houston-ai/board";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { storeType } from "@houston-ai/store";
import { Archive } from "lucide-react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { AGENT_ICON, ARCHIVED, DONE_MISSION } from "./sample";

/**
 * The archived list's demos and props table. Helper module: no `specimen`.
 */

/** The delete tooltip and confirm copy, already translated by the consumer. */
const LABELS = {
  deleteTooltip: "Delete mission",
  deleteTitle: (name: string) => `Delete "${name}"?`,
  deleteDescription: "The mission and its history are removed for good.",
};

/** A body match: the fragment plus the character range that matched in it. */
export const SNIPPET: Record<string, BoardSearchSnippet> = {
  [DONE_MISSION.id]: {
    text: "…assigned the pricing follow-up to Ana Silva and set Thursday as the deadline.",
    ranges: [{ start: 14, end: 21 }],
  },
};

/** The list as Mission Control's Archived view mounts it, with a working delete. */
export function LiveArchivedList({
  align = "center",
}: {
  align?: "center" | "left";
}) {
  const [items, setItems] = useState(ARCHIVED);
  const [selectedId, setSelectedId] = useState<string | null>(ARCHIVED[0].id);

  return (
    <div className="flex h-72 w-full flex-col rounded-xl bg-background">
      <KanbanList
        items={items}
        align={align}
        avatar={AGENT_ICON}
        cardLabels={LABELS}
        selectedId={selectedId}
        searchSnippets={SNIPPET}
        onSelect={(item) => setSelectedId(item.id)}
        onDelete={(item) =>
          setItems((current) => current.filter((one) => one.id !== item.id))
        }
        emptyState={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Archive />
              </EmptyMedia>
              <EmptyTitle>Nothing archived</EmptyTitle>
              <EmptyDescription>
                Missions you finish and put away land here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      {items.length > 0 && (
        <div className="flex items-center justify-between px-3 pb-3">
          <span className={storeType.meta}>
            {items.length} archived missions
          </span>
          <Button variant="outline" size="sm" onClick={() => setItems([])}>
            Delete them all
          </Button>
        </div>
      )}
      {items.length === 0 && (
        <div className="flex justify-center pb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItems(ARCHIVED)}
          >
            Restore the list
          </Button>
        </div>
      )}
    </div>
  );
}

/** One row on its own, so the two row shapes can be compared side by side. */
export function Rows() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-1.5">
      <KanbanListItem
        item={ARCHIVED[1]}
        avatar={AGENT_ICON}
        labels={LABELS}
        onSelect={() => {}}
        onDelete={() => {}}
      />
      <KanbanListItem
        item={DONE_MISSION}
        avatar={AGENT_ICON}
        labels={LABELS}
        snippet={SNIPPET[DONE_MISSION.id]}
        onSelect={() => {}}
        onDelete={() => {}}
      />
      <KanbanListItem
        item={ARCHIVED[2]}
        avatar={AGENT_ICON}
        labels={LABELS}
        selected
        onSelect={() => {}}
      />
    </div>
  );
}

export const LIST_PROPS: SpecimenProp[] = [
  {
    name: "items",
    type: "KanbanItem[]",
    note: "KanbanList sorts them newest-first itself; no column bucketing.",
  },
  {
    name: "selectedId",
    type: "string | null",
    note: "The row whose chat is open in the panel beside the list.",
  },
  {
    name: "onSelect / onDelete",
    type: "(item: KanbanItem) => void",
    note: "Delete renders the row's trash button and confirms before running.",
  },
  {
    name: "avatar",
    type: "React.ReactNode",
    note: "Leading agent icon for every row. Falls back to `item.icon` per row.",
  },
  {
    name: "cardLabels",
    type: "KanbanCardLabels",
    note: "Shared with the card: only the delete tooltip and confirm copy are read.",
  },
  {
    name: "searchSnippets",
    type: "Record<string, BoardSearchSnippet>",
    note: "Keyed by item id. Shows why a mission surfaced when the title did not match.",
  },
  {
    name: "align",
    type: '"center" | "left"',
    note: "Rail sizing: a centred max-w-2xl column, or the full pane width. Default `center`.",
  },
  {
    name: "emptyState",
    type: "React.ReactNode",
    note: "Replaces the list when there is nothing to show.",
  },
];
