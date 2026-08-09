import type { SpecimenProp } from "../../../src/specimen";

/**
 * `SidebarNavItemProps`, read off `ui/layout/src/sidebar-nav.tsx`. Expanded,
 * every one of these is forwarded to a `SidebarRowButton` at BLOCK depth — see
 * the SidebarRowButton page for the anatomy they land in.
 */
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
    note: 'Sidebar-active fill plus text-ink, and aria-current="page". Weight does NOT change: a nav row is block-level and therefore always medium, so selecting one cannot re-measure its label.',
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
    note: "Spread onto the row's ROOT (the pill), e.g. a product-tour target — so the spotlight covers the row rather than the label inside it.",
  },
  {
    name: "collapsed",
    type: "boolean",
    note: "36px icon square; the label moves into a right-side tooltip.",
  },
];
