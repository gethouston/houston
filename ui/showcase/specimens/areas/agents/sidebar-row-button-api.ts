import type { SpecimenProp } from "../../../src/specimen";

/**
 * Every module in the product that draws a rail row, and what it passes.
 *
 * The list is the point of the component: if one of these stopped going
 * through it, the rail would go back to being several stacked lists that only
 * look alike by coincidence. `ui/layout/tests/sidebar-row-anatomy.test.ts`
 * asserts the same list against the source.
 */
export const SIDEBAR_ROW_CONSUMERS: readonly {
  who: string;
  what: string;
}[] = [
  {
    who: "SidebarNavItem",
    what: "The top-level destinations: Mission Control, Integrations, Skills, AI Models, Agent Store, Settings. Block depth, no disclosure. (The collapsed icon rail is its own anatomy and does not come through here.)",
  },
  {
    who: "SidebarBand",
    what: 'The "Your teams" band. Block depth, the 12px `band` type step, a disclosure, and the host\'s create menu in the affordance slot.',
  },
  {
    who: "SidebarGroupHeader",
    what: "A team block's header. Block depth, a disclosure, the rollup badge in the trailing slot, the drag handle, and active whenever the block owns the open view. ONE hit target, with nothing beside it: a team's name and mark are changed in the host's own dialog.",
  },
  {
    who: "SidebarItemRow",
    what: "An agent. Child depth, the avatar in the glyph box, at most one quiet mark in the trailing slot, drag cursor from the sortable wrapper. NO affordance: an agent is renamed, recoloured, moved and deleted on the focused agent screen, so the row has no menu and reserves no column for one.",
  },
  {
    who: "SidebarAddRow",
    what: 'The "New agent" row that closes the list. Child depth, muted, and the anchor the guided tour points at.',
  },
];

/** `SidebarRowButtonProps`, read off `ui/layout/src/sidebar-row-button.tsx`. */
export const SIDEBAR_ROW_BUTTON_PROPS: readonly SpecimenProp[] = [
  {
    name: "label",
    type: "string",
    note: "The row's words. Truncates before any trailing control, never under it.",
  },
  {
    name: "icon",
    type: "ReactNode",
    note: "The leading node in the shared 20px box: a 16px Lucide mark, or an agent's avatar at the same box size. One box for both, which is what puts every glyph in the rail on a single optical column.",
  },
  {
    name: "depth",
    type: '"block" | "child"',
    note: "The whole of the indent, and nothing else. `block` heads a block (8px); `child` hangs under one (20px), in the shared glyph column. Both sit at the same 13px and the SAME weight — the rail runs at one weight throughout (510), so depth is spoken by indent alone and selecting a row can never re-measure its label.",
  },
  {
    name: "band",
    type: "boolean",
    note: 'The row NAMES the list rather than pointing at anything ("Your teams"): 12px against the rows\' 13px, at the same 510 weight as everything else in the rail. Size is the whole distinction — the band used to be semibold grey, which read as a heading bolted above a list instead of the first line of one.',
  },
  {
    name: "muted",
    type: "boolean",
    note: 'A quieter resting label, for a row that names things rather than opening one — the trailing "new" row.',
  },
  {
    name: "active",
    type: "boolean",
    note: 'Selected. Paints the pill AND says so, via aria-current="page": a fill with no announced counterpart is a state only sighted users can read.',
  },
  {
    name: "disclosure",
    type: "{ expanded, contentId? }",
    note: "Makes the row a DISCLOSURE: a small filled triangle immediately after the label, rotating a quarter turn in 150ms, plus aria-expanded and aria-controls pointing at the region it folds. There is no placement option — the mark always sits with the words, because a triangle at the row's far edge reads as a separate control rather than as the label's own state. Omit for a row that simply activates. A row can be both — a collapsed team discloses its contents and is simultaneously active, because its header is the only row a block has left to say where the user is.",
  },
  {
    name: "onActivate / onKeyDown",
    type: "() => void / (e) => void",
    note: "The click, and the keys the row answers itself (Delete / Backspace on a focused agent row).",
  },
  {
    name: "trailing",
    type: "ReactNode",
    note: "Right-aligned INSIDE the button: counts, badges, status dots. Inside, because they describe the row and clicking one should still open it.",
  },
  {
    name: "affordance",
    type: "ReactNode",
    note: 'Right-aligned OUTSIDE the button: a "..." menu trigger, a "+". A sibling and not a child, because a button may not nest inside a button. Wear `sidebarRowAffordanceClasses`.',
  },
  {
    name: "draggable / dragAttributes / dragListeners",
    type: "boolean / DraggableAttributes / SyntheticListenerMap",
    note: "The row IS the drag handle. @dnd-kit's pointer sensor has a 4px activation distance, so a click with no movement still activates. `draggable` alone is for a row whose listeners live on a sortable wrapper and which would otherwise show a pointer cursor over a draggable object.",
  },
  {
    name: "dataAttrs",
    type: "Record<string, string>",
    note: "Attributes on the row's ROOT rather than its button: they identify the ROW (test ids, tour anchors), which is what navigation and drag tests address it by.",
  },
  {
    name: "title",
    type: "string",
    note: "Native title, for a label whose full text is worth hovering for.",
  },
];
