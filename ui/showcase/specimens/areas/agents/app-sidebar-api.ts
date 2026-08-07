import type { SpecimenProp } from "../../../src/specimen";

/** `SidebarProps`, read off `ui/layout/src/sidebar.tsx`. */
export const APP_SIDEBAR_PROPS: readonly SpecimenProp[] = [
  {
    name: "items",
    type: "SidebarItem[]",
    note: "{ id, name, icon?, trailing?, menuContent? }. The agents themselves.",
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
    name: "groups[].sections",
    type: "SidebarSectionRow[]",
    note: "{ id, label, icon?, active, onSelect }. Destination rows drawn above that group's agents. Never draggable, never a drop target.",
  },
  {
    name: "defaultGroup",
    type: "{ name, sections? }",
    note: "Names the trailing default block (the items in no group) and gives it its own destination rows. It gets a header but no chevron and no ⋯ menu: it stands for the container itself.",
  },
  {
    name: "onMoveItem",
    type: "(itemId, { groupId, beforeItemId }) => void",
    note: "Drop target for an agent. groupId null = the ungrouped section.",
  },
  {
    name: "onMoveGroup",
    type: "(groupId, beforeGroupId: string | null) => void",
    note: "Group reorder. null = move to the end.",
  },
  {
    name: "onToggleGroupCollapsed",
    type: "(groupId: string) => void",
    note: "Chevron / label click on a group header.",
  },
  {
    name: "onRenameGroup / onDeleteGroup / onEditGroupContext",
    type: "(groupId: string, …) => void",
    note: "Each one supplied adds its entry to the group's ⋯ menu.",
  },
  {
    name: "renamingGroupId",
    type: "string | null",
    note: "Opens that group straight into inline rename — a just-created group.",
  },
  {
    name: "onRenamingGroupIdHandled",
    type: "() => void",
    note: "Fired once the rename input has taken focus, to clear the id above.",
  },
  {
    name: "onAdd",
    type: "() => void",
    note: "Adds the + button beside the section label (and in the collapsed rail).",
  },
  {
    name: "onRename / onDelete",
    type: "(id: string, …) => void",
    note: "Each one supplied adds its entry to a row's ⋯ menu. Delete also binds Delete/Backspace on the focused row.",
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
    name: "logo",
    type: "ReactNode",
    note: "Legacy top slot, rendered only when there is no `header`.",
  },
  {
    name: "navItems",
    type: "SidebarNavItemEntry[]",
    note: "The destinations above the agent list.",
  },
  {
    name: "activeNavId",
    type: "string",
    note: "Which nav entry is lit. Overrides each entry's own `active`.",
  },
  {
    name: "sectionLabel / sectionAction",
    type: "string / ReactNode",
    note: 'The "Your agents" heading and an inline action at its right edge. Expanded only.',
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
    note: "Extra DOM attributes on the + button, e.g. a product-tour target.",
  },
  {
    name: "children",
    type: "ReactNode",
    note: "Rendered after the <aside>, not inside it — dialogs the rail owns.",
  },
];
