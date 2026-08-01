import type { SpecimenProp } from "../../../src/specimen";

/** `KanbanColumnProps`, read off the component's TypeScript types. */
export const COLUMN_PROPS: SpecimenProp[] = [
  {
    name: "columnId",
    type: "string",
    note: "Published as `data-kanban-column` so the board's drag can hit-test the drop.",
  },
  { name: "label", type: "string", note: "The header name." },
  {
    name: "items",
    type: "KanbanItem[]",
    note: "Already filtered to this section by the board.",
  },
  {
    name: "selectedId / highlightedId",
    type: "string | null",
    note: "Which card is open, and which one arrow keys sit on.",
  },
  {
    name: "onAdd / addLabel",
    type: "() => void | string",
    note: 'The trailing "+" button and its accessible label. Default "Add item".',
  },
  {
    name: "headerAction",
    type: "React.ReactNode",
    note: "Consumer-owned control on the header's right (e.g. archive all).",
  },
  {
    name: "onSelect / onDelete / onApprove / onRename",
    type: "(item: KanbanItem) => void",
    note: "Per-card handlers, rebound from the card's argument-free ones.",
  },
  {
    name: "renderCard",
    type: "(item: KanbanItem) => React.ReactNode",
    note: "Replaces KanbanCard entirely for this column.",
  },
  {
    name: "selectable / selectedIds / onToggleSelect",
    type: "boolean | ReadonlySet<string> | (item) => void",
    note: "Multi-select, forwarded to every card in the column.",
  },
  {
    name: "dndEnabled / isDropTarget / isOver / draggingId",
    type: "boolean | string | null",
    note: "The drag state the board resolves; the column only paints it.",
  },
];
