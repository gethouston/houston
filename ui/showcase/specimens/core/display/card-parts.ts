import type { SpecimenProp } from "../../../src/specimen";

/** The public API of the seven `card.tsx` exports, read off their TS types. */
export const CARD_PROPS: readonly SpecimenProp[] = [
  {
    name: "Card ...props",
    type: 'React.ComponentProps<"div">',
    note: "The frame: hairline border, 12px radius, 24px vertical padding, `shadow-sm`.",
  },
  {
    name: "CardHeader ...props",
    type: 'React.ComponentProps<"div">',
    note: "Grid header; switches to two columns when a `CardAction` is present.",
  },
  {
    name: "CardTitle ...props",
    type: 'React.ComponentProps<"div">',
    note: "Semibold, tight leading. Renders a `<div>` — choose the heading level in your own markup.",
  },
  {
    name: "CardDescription ...props",
    type: 'React.ComponentProps<"div">',
    note: "The muted supporting line under the title.",
  },
  {
    name: "CardAction ...props",
    type: 'React.ComponentProps<"div">',
    note: "Top-right slot inside the header. Must be a child of `CardHeader`.",
  },
  {
    name: "CardContent ...props",
    type: 'React.ComponentProps<"div">',
    note: "Body, 24px gutters.",
  },
  {
    name: "CardFooter ...props",
    type: 'React.ComponentProps<"div">',
    note: "Row of actions; add `border-t` for a divider and it grows its own top padding.",
  },
  {
    name: "className",
    type: "string",
    note: "Merged last on every slot.",
  },
];
