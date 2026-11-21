import type { SpecimenProp } from "../../../src/specimen";

export const APP_SIDEBAR_PROPS: readonly SpecimenProp[] = [
  {
    name: "items",
    type: "SidebarItem[]",
    note: "{ id, name, icon?, subtitle?, trailing? }. The agents themselves, as message-list rows: `subtitle` is the one or two lines under the name, `trailing` the badge at their end. No menu slot: an agent is renamed, recoloured, moved and deleted where it is configured, so a rail row offers none of it.",
  },
  {
    name: "pinnedItems",
    type: "SidebarItem[]",
    note: "Rows that lead the list outside its scroll box (the AI Manager): drawn and selected like `items`, never grouped or dragged.",
  },
  {
    name: "selectedId",
    type: "string | null",
    note: "The open agent. Controlled — the rail never picks one itself.",
  },
  { name: "onSelect", type: "(id: string) => void", note: "Row click." },
  {
    name: "groups",
    type: "SidebarGroupView[]",
    note: "{ id, name, collapsed, itemIds }. Present (even []) switches the flat list for the grouped drag-and-drop layout.",
  },
  {
    name: "groups[].trailing",
    type: "ReactNode",
    note: "A badge INSIDE the header row: the block's own rollup of whatever its items are signalling. A folded block hides its rows, so anything they were saying leaves the rail with them; this is the slot that says it on their behalf. The library counts nothing — the host composes the node and, by passing none, says an open block adds nothing.",
  },
  {
    name: "groups[].icon",
    type: "ReactNode",
    note: "The block's mark, in the glyph column shared by every row under it. The box is reserved either way, so a block with no icon still lines its name up with its neighbours'. Keep it monochrome: the identity colour in that column belongs to the agent avatars one indent to the right.",
  },
  {
    name: "groups[].active",
    type: "boolean",
    note: "Paints the block's HEADER as the selected row. Controlled. A block carries no destination rows, so its header is the only row that can say the open view belongs here — folded or open alike.",
  },
  {
    name: "onArrange",
    type: "({ order, members }) => boolean",
    note: "A drop landed. Carries the whole arrangement the rail now shows: the top-level order (agents and groups interleaved) and every group's members. The host stores it as given and answers whether it did; the rail keeps the dropped order only on true. Absent means the rail offers no drag.",
  },
  {
    name: "onActivateGroup",
    type: "(groupId: string) => void",
    note: "The block's header was activated — ONE hit target carrying the glyph, the name, the disclosure triangle and the rollup badge. It folds or unfolds the block, and `collapsed` on the view model stays the single controlled truth about the fold: the host writes the new value back. The triangle is an indicator, never a second control.",
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "The icon rail is 56px, or 84px with windowControlsInset. Defaults to false. Grouping is expanded-only; the icon rail renders the flat list.",
  },
  {
    name: "onToggleCollapsed",
    type: "() => void",
    note: "Adds the always-visible collapse or expand button. Only the button toggles the rail.",
  },
  {
    name: "headerActions",
    type: "ReactNode",
    note: "The host's verbs (search, create) on the rail's top line: after the collapse toggle, at the line's end, when expanded; stacked under the toggle when collapsed. Wear `sidebarHeaderControlClasses` so they match the toggle.",
  },
  {
    name: "windowControlsInset",
    type: "boolean",
    note: "Reserves a 40px controls row and an 84px zone at the top of the rail. The collapsed rail is 84px wide. Defaults to false.",
  },
  {
    name: "headerBelow",
    type: "ReactNode",
    note: "A FULL-WIDTH notice under the top line and above the list (e.g. the pending-invite inbox), spanning the rail like every row below it.",
  },
  {
    name: "listFooter",
    type: "ReactNode",
    note: 'Closes the list inside its scroll box, right after the last row, in both rail states: typically `SidebarAddRow`, the "Add new AI Employee" shortcut.',
  },
  {
    name: "footer",
    type: "ReactNode",
    note: "Bottom slot, typically the connect rows (`SidebarConnectGroup`) over the account (`SidebarProfileMenu`); `shrink-0`, so a short window squeezes the list instead.",
  },
  {
    name: "labels",
    type: "SidebarLabels",
    note: "Labels for the collapse/expand control and the drag announcements. English defaults keep every state readable.",
  },
  {
    name: "children",
    type: "ReactNode",
    note: "Rendered after the <aside>, not inside it — dialogs the rail owns.",
  },
];
