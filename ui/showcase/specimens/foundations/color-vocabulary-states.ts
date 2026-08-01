import type { ColorWord } from "./color-vocabulary";

/**
 * Status, chips and the sidebar — the families where a token's whole job is a
 * state. Every status fill ships with the ink that reads on it, so the two are
 * documented as a pair rather than as one colour and a guess.
 */
export const STATE_WORDS: Record<string, ColorWord> = {
  danger: {
    label: "Danger",
    role: "Destructive actions and failures. The only red in the product.",
  },
  "danger-text": {
    label: "Danger ink",
    role: "The label on a danger fill.",
  },
  success: {
    label: "Success",
    role: "A finished run, a connected integration, a saved change.",
  },
  "success-text": {
    label: "Success ink",
    role: "The label on a success fill.",
  },
  warning: {
    label: "Warning",
    role: "Something needs attention, but nothing broke.",
  },
  "warning-text": {
    label: "Warning ink",
    role: "The label on a warning fill.",
  },
  highlight: {
    label: "Highlight",
    role: "The brand wash behind matched text in a search result.",
  },
  "highlight-text": {
    label: "Highlight ink",
    role: "The text sitting inside a highlight wash.",
  },

  chip: {
    label: "Chip",
    role: "The soft translucent pill behind one word of metadata.",
  },
  "chip-solid": {
    label: "Solid chip",
    role: "The opaque chip, for chips over glass where a translucent fill would stack on itself.",
  },
  "chip-solid-hover": {
    label: "Solid chip hover",
    role: "The solid chip while the pointer is over it.",
  },
  "chip-text": {
    label: "Chip ink",
    role: "The label inside a chip.",
  },
  "chip-subtle": {
    label: "Recessed panel",
    role: "The faintest fill in the system: board columns, code blocks and rails that sit BELOW the card tier.",
  },

  sidebar: {
    label: "Sidebar",
    role: "Transparent by design — the rail melts into the gutter instead of painting a slab of its own.",
  },
  "sidebar-text": {
    label: "Sidebar ink",
    role: "Labels in the rail.",
  },
  "sidebar-line": {
    label: "Sidebar line",
    role: "The rail's hairline separators.",
  },
  "sidebar-hover": {
    label: "Sidebar hover",
    role: "The fill a rail row takes under the pointer.",
  },
  "sidebar-hover-text": {
    label: "Sidebar hover ink",
    role: "The label colour that pairs with the rail hover fill.",
  },
  "sidebar-active": {
    label: "Sidebar selected",
    role: "The selected rail row — a clear step above hover in both themes, so selection never reads as hover.",
  },
};
