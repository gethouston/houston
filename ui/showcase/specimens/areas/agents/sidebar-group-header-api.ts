import type { SidebarLabels } from "@houston-ai/layout";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * The header takes `Required<SidebarLabels>` — `AppSidebar` merges the caller's
 * overrides over its own defaults before handing them down, so a standalone
 * specimen has to supply the whole bag. These are `DEFAULT_LABELS` verbatim.
 */
export const GROUP_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  moreOptions: "More options",
  renameItem: "Rename",
  deleteItem: "Delete",
  collapseSidebar: "Collapse sidebar",
  createGroup: "New group",
  renameGroup: "Rename group",
  deleteGroup: "Delete group",
  leaveGroup: "Leave group",
  editGroupContext: "Edit shared context",
  groupMenu: "Group options",
  newGroupPlaceholder: "Group name",
  emptyGroupHint: "Drag agents here",
};

/** `SidebarGroupHeaderProps`, read off `ui/layout/src/sidebar-group-header.tsx`. */
export const SIDEBAR_GROUP_HEADER_PROPS: readonly SpecimenProp[] = [
  {
    name: "group",
    type: "SidebarGroupView",
    note: "{ id, name, collapsed, itemIds } — the group as the shell stores it.",
  },
  {
    name: "group.affordances",
    type: "{ rename?, delete?, context?, leave? }",
    note: "Per-group menu mask. Absent, or a field left out, means the callback alone decides; only false takes an entry away. `leave` is the exception: it must be an explicit true.",
  },
  {
    name: "count",
    type: "number",
    note: "Resolved agent count. Passed in, never derived from itemIds.",
  },
  {
    name: "labels",
    type: "Required<SidebarLabels>",
    note: "The whole bag. AppSidebar merges defaults before passing it down.",
  },
  {
    name: "onToggleCollapsed",
    type: "(groupId: string) => void",
    note: "Chevron or label click.",
  },
  {
    name: "onEditContext / onRenameGroup / onDeleteGroup",
    type: "(groupId: string, …) => void",
    note: "Each one supplied adds its ⋯ entry; delete paints danger.",
  },
  {
    name: "onLeave",
    type: "(groupId: string) => void",
    note: "Gives up the caller's membership, so it sits last, behind a separator. Needs affordances.leave === true as well.",
  },
  {
    name: "onCancelRename",
    type: "(groupId: string) => void",
    note: "The inline rename ended without committing (Escape, or leaving the field empty or unchanged). Fires exactly once, so a host that only creates the group on commit can drop its draft row.",
  },
  {
    name: "maxNameRunes",
    type: "number",
    note: "Ceiling on the inline-rename field, counted in RUNES (code points), because a maxLength attribute counts UTF-16 units and would halve a name of emoji. Absent means no cap; the field clamps rather than refusing, so pasting is never blocked.",
  },
  {
    name: "startRenaming / onRenameStarted",
    type: "boolean / () => void",
    note: "Opens straight into rename, then reports back so the flag can clear.",
  },
  {
    name: "dragAttributes / dragListeners",
    type: "DraggableAttributes / SyntheticListenerMap",
    note: "@dnd-kit handle props; the chevron and the name are the drag handle.",
  },
];
