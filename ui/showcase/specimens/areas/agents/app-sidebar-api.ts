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
    name: "groups[].affordances",
    type: "{ rename?, delete?, context?, leave? }",
    note: "Per-group menu mask. Absent, or a field left out, means the callback alone decides; only false takes an entry away. `leave` is the exception: it must be an explicit true.",
  },
  {
    name: "defaultGroup",
    type: "{ name, icon?, trailing?, collapsed?, active? }",
    note: "Turns the trailing default block (the agents in no group) into a labelled team: the workspace's own. It folds exactly like a named one — a block that folded everywhere except here would be the one row in the rail that answers a click differently. What it does not get is what the container itself lacks: no ⋯ menu, no rename, no delete, no drag handle.",
  },
  {
    name: "onActivateDefault",
    type: "() => void",
    note: "The default block's header was activated. Its own callback because that block is not a stored group and has no id to hand back.",
  },
  {
    name: "onMoveItem",
    type: "(itemId, { groupId, beforeItemId }) => void",
    note: "An agent was reordered WITHIN its own block. groupId is always the block it was already in (null = the ungrouped section): a drag cannot move an agent between blocks, so it is the position that changed and never the block.",
  },
  {
    name: "onMoveGroup",
    type: "(groupId, beforeGroupId: string | null) => void",
    note: "Group reorder. null = move to the end.",
  },
  {
    name: "onActivateGroup",
    type: "(groupId: string) => void",
    note: "The block's header was activated — ONE hit target carrying the glyph, the name, the disclosure triangle and the rollup badge. The library does NOT decide what that means: a host may open the block's screen, fold the block, or both, and `collapsed` on the view model stays the single controlled truth about the fold. The triangle is an indicator, never a second control.",
  },
  {
    name: "onRenameGroup / onDeleteGroup / onEditGroupContext",
    type: "(groupId: string, …) => void",
    note: "Each one supplied adds its entry to the group's ⋯ menu, subject to that group's `affordances`. A block left with no entries renders no trigger at all.",
  },
  {
    name: "onLeaveGroup",
    type: "(groupId: string) => void",
    note: "Gives up the caller's membership rather than editing the group, so its entry sits last, behind a separator. Needs `affordances.leave === true` on top of this callback.",
  },
  {
    name: "groupNameMaxRunes",
    type: "number",
    note: "Ceiling on a group's rename field, in RUNES, because maxLength counts UTF-16 units and would halve a name of emoji. The field clamps rather than refusing, so pasting is never blocked.",
  },
  {
    name: "onAdd",
    type: "() => void",
    note: "Creates an agent. In the GROUPED list it renders as the row that CLOSES the list, because this is the rail's primary action and a primary action may not live only one level deep inside a menu. Flat and collapsed, it stays the trailing icon button.",
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "The 56px icon rail. Defaults to false. Grouping is expanded-only — the rail always renders the flat list.",
  },
  {
    name: "onToggleCollapsed",
    type: "() => void",
    note: "Adds the always-visible collapse button; also fires on a click anywhere non-interactive on the collapsed rail.",
  },
  {
    name: "header",
    type: "ReactNode",
    note: "Top slot — the WorkspaceSwitcher. Shares its row with the collapse button.",
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
    note: 'The "Your teams" band and its ONE trailing control — the menu that creates an agent, creates a team and joins one. Expanded only.',
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
    note: "Every string the rail owns (add, rename, delete, group menu, empty-group hint). English defaults.",
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
