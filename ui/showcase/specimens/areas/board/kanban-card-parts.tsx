import { KanbanCard } from "@houston-ai/board";
import { Button, cn } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";
import type { ReactNode } from "react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { AGENT_ICON, DONE_MISSION, NEEDS_YOU_MISSION } from "./sample";

/**
 * The card's live demos and the slot they sit in. Helper module: it exports no
 * `specimen`, so the page beside it pulls these in.
 */

/** A card never floats — it sits in a column, on the column's own tone, at the
 *  column's width. Reviewing one outside that slot judges the wrong contrast. */
export function CardSlot({ children }: { children: ReactNode }) {
  return <div className="w-64 rounded-xl bg-chip p-1.5">{children}</div>;
}

/**
 * Rename and delete, wired for real: the title the input commits is the title
 * the card then shows, and confirming the delete dialog removes the card. Both
 * are the component's own state machines (an inline input; `ConfirmDialog`) —
 * there is nothing to stub and never a browser dialog.
 */
export function EditableCard() {
  const [title, setTitle] = useState(NEEDS_YOU_MISSION.title);
  const [deleted, setDeleted] = useState(false);

  if (deleted) {
    return (
      <div className="flex w-64 flex-col items-start gap-2 rounded-xl bg-chip p-3">
        <span className={storeType.meta}>Mission deleted.</span>
        <Button variant="outline" size="sm" onClick={() => setDeleted(false)}>
          Put it back
        </Button>
      </div>
    );
  }

  return (
    <CardSlot>
      <KanbanCard
        item={{ ...NEEDS_YOU_MISSION, title }}
        avatar={AGENT_ICON}
        onSelect={() => {}}
        onRename={setTitle}
        onDelete={() => setDeleted(true)}
        onApprove={() => {}}
      />
    </CardSlot>
  );
}

/**
 * The multi-select set, held where a board would hold it. Checking one card
 * flips `anySelected`, which is what keeps EVERY checkbox visible — the
 * affordance is never hover-gated once a selection exists.
 */
export function SelectableCards() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set([NEEDS_YOU_MISSION.id]),
  );
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      {[NEEDS_YOU_MISSION, DONE_MISSION].map((item) => (
        <CardSlot key={item.id}>
          <KanbanCard
            item={item}
            avatar={AGENT_ICON}
            onSelect={() => {}}
            selectable
            selectedForBulk={selected.has(item.id)}
            anySelected={selected.size > 0}
            onToggleSelect={() => toggle(item.id)}
          />
        </CardSlot>
      ))}
      <span className={cn(storeType.meta, "self-center")}>
        {selected.size} selected
      </span>
    </>
  );
}

/** `KanbanCardProps`, read off the component's TypeScript types. */
export const CARD_PROPS: SpecimenProp[] = [
  {
    name: "item",
    type: "KanbanItem",
    note: "The mission. `group` is the agent name, `people` the face stack.",
  },
  { name: "onSelect", type: "() => void", note: "Opens the mission." },
  {
    name: "onDelete / onApprove / onRename",
    type: "() => void | (newTitle: string) => void",
    note: "Each renders its icon button only when passed. Delete confirms first.",
  },
  {
    name: "runningStatuses / approveStatuses / errorStatuses",
    type: "string[]",
    note: 'Default ["running"] / ["needs_you"] / ["error"].',
  },
  {
    name: "avatar",
    type: "React.ReactNode",
    note: "The board-wide agent icon. Falls back to `item.icon`.",
  },
  {
    name: "actions",
    type: "React.ReactNode",
    note: "Footer slot. Replaces the built-in approve button when set.",
  },
  {
    name: "selected / highlighted",
    type: "boolean",
    note: "Open in the panel / moved to by arrow keys. Default false.",
  },
  {
    name: "selectable / selectedForBulk / anySelected / onToggleSelect",
    type: "boolean | () => void",
    note: "The multi-select checkbox. `anySelected` keeps every checkbox visible.",
  },
  {
    name: "enableDrag / dragging",
    type: "boolean",
    note: "Marks the card draggable for the board's pointer drag; dims it while dragged.",
  },
  {
    name: "labels",
    type: "KanbanCardLabels",
    note: "Tooltips and confirm copy, already translated. English defaults.",
  },
];
