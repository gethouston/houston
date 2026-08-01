import type { SpecimenProp } from "../../../src/specimen";

/**
 * `HoverCard`'s public API, read off `ui/core/src/components/hover-card.tsx`. Split
 * out only to keep the specimen file inside the 200-line rule.
 */
export const hoverCardProps: SpecimenProp[] = [
  { name: "HoverCard.open", type: "boolean", note: "Controlled open state." },
  {
    name: "HoverCard.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires when hover or focus opens/closes it.",
  },
  {
    name: "HoverCard.openDelay",
    type: "number",
    note: "Default 700ms. How long the pointer must rest before it opens.",
  },
  {
    name: "HoverCard.closeDelay",
    type: "number",
    note: "Default 300ms. Grace period when the pointer leaves.",
  },
  {
    name: "HoverCardContent.align",
    type: '"start" | "center" | "end"',
    note: 'Default "center".',
  },
  {
    name: "HoverCardContent.side",
    type: '"top" | "right" | "bottom" | "left"',
    note: 'Default "bottom". Flips automatically when it would overflow.',
  },
  {
    name: "HoverCardContent.sideOffset",
    type: "number",
    note: "Default 4. Gap in px between trigger and content.",
  },
];
