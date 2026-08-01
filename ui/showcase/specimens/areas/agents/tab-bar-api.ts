import type { SpecimenProp } from "../../../src/specimen";

/** `TabBarProps`, read off `ui/layout/src/tab-bar.tsx`. */
export const TAB_BAR_PROPS: readonly SpecimenProp[] = [
  {
    name: "tabs",
    type: "{ id, label, badge?, chip?, disabled? }[]",
    note: "The strip. `badge` renders only above zero; `chip` is a text pill beside the label.",
  },
  {
    name: "activeTab",
    type: "string",
    note: "Controlled — matched against each tab's `id`.",
  },
  {
    name: "onTabChange",
    type: "(id: string) => void",
    note: "Required. Never fires for a disabled tab.",
  },
  {
    name: "title",
    type: "string",
    note: "The agent's name, as the row's h1.",
  },
  {
    name: "menu",
    type: "ReactNode",
    note: "Slot immediately right of the title — the agent's ⋯ menu.",
  },
  {
    name: "actions",
    type: "ReactNode",
    note: "Right-aligned slot on the title row; takes the remaining width.",
  },
];
