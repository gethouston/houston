import type { SpecimenProp } from "../../../src/specimen";

/** `SidebarNavItemProps`, read off `ui/layout/src/sidebar-nav.tsx`. */
export const SIDEBAR_NAV_ITEM_PROPS: readonly SpecimenProp[] = [
  { name: "icon", type: "ReactNode", note: "Required. 16px Lucide." },
  {
    name: "label",
    type: "string",
    note: "The row text; the tooltip and aria-label when collapsed.",
  },
  {
    name: "active",
    type: "boolean",
    note: "Sidebar-active fill and medium weight.",
  },
  { name: "onClick", type: "() => void", note: "Required." },
  {
    name: "trailing",
    type: "ReactNode",
    note: 'Right-aligned slot — a "Beta" badge, a count.',
  },
  {
    name: "dataAttrs",
    type: "Record<string, string>",
    note: "Spread onto the button, e.g. a product-tour target.",
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "36px icon square; the label moves into a right-side tooltip.",
  },
];
