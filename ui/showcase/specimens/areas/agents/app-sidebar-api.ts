import type { SpecimenProp } from "../../../src/specimen";

/** `SidebarProps`, read off `ui/layout/src/sidebar-props.ts`. */
export const APP_SIDEBAR_PROPS: readonly SpecimenProp[] = [
  {
    name: "items",
    type: "SidebarItem[]",
    note: "{ id, name, icon?, trailing? }. The agents themselves. No menu slot: an agent is renamed, recoloured, moved and deleted where it is configured, so a rail row offers none of it.",
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
    name: "onAdd",
    type: "() => void",
    note: "Creates an agent. In the GROUPED list it renders as the row that CLOSES the list, because this is the rail's primary action and a primary action may not live only one level deep inside a menu. Flat and collapsed, it stays the trailing icon button.",
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
    name: "header",
    type: "ReactNode",
    note: "Top slot for the WorkspaceSwitcher. Without an inset, it shares its expanded row with the collapse button; with an inset, it sits below the controls row.",
  },
  {
    name: "windowControlsInset",
    type: "boolean",
    note: "Reserves a 40px controls row and an 84px zone at the top of the rail. The collapsed rail is 84px wide. Defaults to false.",
  },
  {
    name: "headerBelow",
    type: "ReactNode",
    note: "A FULL-WIDTH band under the header and above the nav (e.g. the pending-invite inbox). Separate from `header` so it spans the rail instead of being inset by the collapse toggle, and so the toggle stays on the header's own line.",
  },
  {
    name: "logo",
    type: "ReactNode",
    note: "Legacy top slot, rendered only when there is no `header`.",
  },
  {
    name: "navSections",
    type: "SidebarNavSection[]",
    note: "The destinations above the agent list, in labelled runs. A section whose items are all gated away is dropped with its band.",
  },
  {
    name: "activeNavId",
    type: "string",
    note: "Which nav entry is lit. Overrides each entry's own `active`.",
  },
  {
    name: "sectionLabel / sectionAction",
    type: "string / ReactNode",
    note: 'The "Your AI Employees" band and its ONE trailing control — the menu that creates an AI Employee or a group. Expanded only.',
  },
  {
    name: "sectionCollapsed",
    type: "boolean",
    note: "Folds the WHOLE list away behind the band, whose label is itself the toggle. Controlled, because the host persists it: a rail that forgets it was folded on every reload is worse than one that never folded. Ignored on the icon rail, which has no band to fold from.",
  },
  {
    name: "onToggleSectionCollapsed",
    type: "() => void",
    note: "Absent means the band folds nothing and renders as a plain label, promising no click it cannot honour.",
  },
  {
    name: "footer",
    type: "ReactNode",
    note: "Bottom slot; `shrink-0`, so a short window squeezes the list instead.",
  },
  {
    name: "labels",
    type: "SidebarLabels",
    note: "Labels for the add row and the collapse/expand control. English defaults keep both states readable.",
  },
  {
    name: "addItemDataAttrs",
    type: "Record<string, string>",
    note: "Extra DOM attributes on the add-agent control, e.g. a product-tour target.",
  },
  {
    name: "children",
    type: "ReactNode",
    note: "Rendered after the <aside>, not inside it — dialogs the rail owns.",
  },
];
