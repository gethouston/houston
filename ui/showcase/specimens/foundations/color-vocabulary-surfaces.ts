import type { ColorWord } from "./color-vocabulary";

/**
 * The surface ladder, the ink on it, the interactive roles and the lines —
 * the vocabulary a designer uses to direct a change ("make the gutter a hair
 * darker", "that should be muted ink").
 *
 * The sentences are the design system's own, condensed from `/DESIGN.md`
 * (the surface ladder).
 */
export const SURFACE_WORDS: Record<string, ColorWord> = {
  base: {
    label: "Gutter",
    role: "The recessed window frame the sidebar melts into. One step below the screen, so the content pane reads as raised.",
  },
  background: {
    label: "Screen",
    role: "The floating content pane every screen sits on. Pure white in light; frosted glass in dark.",
  },
  input: {
    label: "Field",
    role: "The surface of inputs, the composer and floating pills. Sits slightly recessed on the white screen in light. Never a whole pane.",
  },
  card: {
    label: "Card",
    role: "The glass fill of a card or panel that should lift off the screen.",
  },
  "card-hover": {
    label: "Card hover",
    role: "The same glass one step brighter, while the pointer is over an interactive card. No lift, no shadow.",
  },
  "card-solid": {
    label: "Solid card",
    role: "The opaque board-card fill, for cards that must not let the column behind them bleed through.",
  },
  popover: {
    label: "Popover",
    role: "Menus and popovers. Solid in both themes: a floating surface never shows what is under it.",
  },
  dialog: {
    label: "Dialog",
    role: "Modal surfaces. Solid in both themes, for the same reason as the popover.",
  },

  ink: {
    label: "Ink",
    role: "Body text and icons — the default foreground of everything on the page.",
  },
  "ink-muted": {
    label: "Muted ink",
    role: "Secondary text: captions, counts, placeholders and resting icons.",
  },
  "card-text": {
    label: "Card ink",
    role: "Foreground inside a card, where the card's own fill sets the contrast.",
  },
  "popover-text": {
    label: "Popover ink",
    role: "Foreground inside a menu or a popover.",
  },

  action: {
    label: "Action",
    role: "The filled call to action: the primary button, the progress bar, the active tab underline. At most one is visible per view.",
  },
  "action-text": {
    label: "Action ink",
    role: "The label on a filled action.",
  },
  hover: {
    label: "Hover",
    role: "The fill a row, a menu item or a ghost button takes while the pointer is over it.",
  },
  "hover-text": {
    label: "Hover ink",
    role: "The label colour that pairs with the hover fill.",
  },
  focus: {
    label: "Focus",
    role: "The keyboard focus ring and the focused field's border. Always visible — focus is never a hover-only affordance.",
  },

  line: {
    label: "Line",
    role: "The hairline. Depth in Houston is this 1px line plus a step on the surface ladder, never a drop shadow.",
  },
  "line-input": {
    label: "Field line",
    role: "The slightly stronger border a field or a hovered control wears.",
  },
};
