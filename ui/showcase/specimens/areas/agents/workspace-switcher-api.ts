import type { SpecimenProp } from "../../../src/specimen";

/** `WorkspaceSwitcherProps`, read off `ui/layout/src/workspace-switcher.tsx`. */
export const WORKSPACE_SWITCHER_PROPS: readonly SpecimenProp[] = [
  {
    name: "workspaces",
    type: "{ id: string; name: string }[]",
    note: "Everything the menu lists, in display order.",
  },
  {
    name: "currentId",
    type: "string | null",
    note: "Which menu entry reads as current. null marks none.",
  },
  {
    name: "currentName",
    type: "string",
    note: "The trigger label, and the source of the collapsed monogram.",
  },
  {
    name: "onSwitch",
    type: "(workspaceId: string) => void",
    note: "Required.",
  },
  {
    name: "onCreate",
    type: "() => void",
    note: 'Required — the "+" entry under the separator.',
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "Monogram button instead of the name row. Defaults to false.",
  },
  {
    name: "onExpand",
    type: "() => void",
    note: "Collapsed only: makes the monogram the expand-sidebar button.",
  },
  {
    name: "createLabel / expandLabel",
    type: "string",
    note: '"Create workspace" / "Expand sidebar". Pass translations.',
  },
];
