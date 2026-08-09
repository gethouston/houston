import type { SidebarLabels } from "@houston-ai/layout";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * The header takes `Required<SidebarLabels>` — `AppSidebar` merges the caller's
 * overrides over its own defaults before handing them down, so a standalone
 * specimen has to supply the whole bag. These are `DEFAULT_LABELS` verbatim.
 */
export const GROUP_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  collapseSidebar: "Collapse sidebar",
  createGroup: "New group",
  renameGroup: "Rename group",
  deleteGroup: "Delete group",
  leaveGroup: "Leave group",
  groupMenu: "Group options",
  newGroupPlaceholder: "Group name",
};

/** `SidebarGroupHeaderProps`, read off `ui/layout/src/sidebar-group-header.tsx`. */
export const SIDEBAR_GROUP_HEADER_PROPS: readonly SpecimenProp[] = [
  {
    name: "name",
    type: "string",
    note: "The block's name. Plain string, not the group record — the header renders one row and needs nothing else.",
  },
  {
    name: "icon",
    type: "ReactNode",
    note: "The block's mark, in the shared glyph column. The box is reserved either way, so a block with no icon still puts its name on the same optical column as its neighbours.",
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "Folded. Rotates the disclosure triangle and, in the host, hides the whole region below — every member row the block holds.",
  },
  {
    name: "contentId",
    type: "string",
    note: "The id of the region this row folds, wired as aria-controls. Omitted by the drag preview, which folds nothing.",
  },
  {
    name: "active",
    type: "boolean",
    note: 'Paints the selected pill and sets aria-current="page". True whenever the block owns the open view, folded or open: a block carries no destination rows, so this row is the only one that can answer "where am I" for it.',
  },
  {
    name: "onActivate",
    type: "() => void",
    note: "The whole row is ONE hit target — glyph, name, triangle and badge in a single button, so a keyboard user reaches it in one stop and a screen reader is told it discloses something. What activating it DOES is the host's: it may open the block's screen, fold the block, or both. The triangle states the fold and takes no clicks of its own; a second control on the row would promise an outcome it does not own.",
  },
  {
    name: "menu",
    type: "(beginRename: () => void) => ReactNode",
    note: "The ⋯ menu, rendered as the toggle's SIBLING because a button may not nest inside a button. A render prop so its Rename entry can open the inline rename the header owns. Absent for a block with no affordances (the default team).",
  },
  {
    name: "rename",
    type: "{ maxRunes?, onCommit }",
    note: "Inline rename. Absent means the name is not editable from the rail.",
  },
  {
    name: "rename.maxRunes",
    type: "number",
    note: "Ceiling on the field, counted in RUNES (code points), because a maxLength attribute counts UTF-16 units and would halve a name of emoji. Absent means no cap; the field clamps rather than refusing, so pasting is never blocked.",
  },
  {
    name: "rename.onCommit",
    type: "(newName: string) => void",
    note: "Commits a changed, non-empty name on Enter or blur.",
  },
  {
    name: "labels",
    type: "Required<SidebarLabels>",
    note: "The whole bag. AppSidebar merges defaults before passing it down.",
  },
  {
    name: "dragAttributes / dragListeners",
    type: "DraggableAttributes / SyntheticListenerMap",
    note: "@dnd-kit handle props, spread on the toggle: the row is both the disclosure and the drag handle. The pointer sensor has a 4px activation distance, so a click with no movement still toggles.",
  },
  {
    name: "dataAttrs",
    type: "Record<string, string>",
    note: "Extra attributes on the row's ROOT, not the toggle: they identify the BLOCK, and that identity has to survive the row swapping into its rename input.",
  },
];
