import type { SpecimenProp } from "../../../src/specimen";

/**
 * `SidebarGroupHeaderProps`, read off `ui/layout/src/sidebar-group-header.tsx`.
 *
 * The header renders no words of its own: every string on the row arrives as a
 * prop (`name`) or as a node the host composed (`icon`, `trailing`), which is
 * what keeps this component out of the i18n runtime and lets a specimen mount
 * it standalone with nothing but literals.
 */
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
    name: "trailing",
    type: "ReactNode",
    note: "A badge INSIDE the row, right-aligned: the block's rollup of what its rows are signalling. A folded block hides them, so this is the slot that speaks on their behalf. The library counts nothing — the host composes the node, and by passing none says the block adds nothing.",
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
    name: "dragAttributes / dragListeners",
    type: "DraggableAttributes / SyntheticListenerMap",
    note: "@dnd-kit handle props, spread on the toggle: the row is both the disclosure and the drag handle. The pointer sensor has a 4px activation distance, so a click with no movement still toggles.",
  },
  {
    name: "dataAttrs",
    type: "Record<string, string>",
    note: "Extra attributes on the row's ROOT, not the toggle: they identify the BLOCK, which is what navigation and drag tests address it by.",
  },
];
