import type { SpecimenProp } from "../../../src/specimen";

/**
 * `Tooltip`'s public API, read off `ui/core/src/components/tooltip.tsx`. Split
 * out only to keep the specimen file inside the 200-line rule.
 */
export const tooltipProps: SpecimenProp[] = [
  {
    name: "TooltipProvider.delayDuration",
    type: "number",
    note: "Default 0 in Houston — the tip is instant. Wrap the app once.",
  },
  {
    name: "TooltipProvider.skipDelayDuration",
    type: "number",
    note: "Window in which moving to a second trigger skips the delay.",
  },
  {
    name: "Tooltip.open",
    type: "boolean",
    note: "Controlled open state. Rarely needed.",
  },
  {
    name: "Tooltip.delayDuration",
    type: "number",
    note: "Per-tooltip override of the provider's delay.",
  },
  {
    name: "TooltipTrigger.asChild",
    type: "boolean",
    note: "Merges onto your element instead of rendering a button.",
  },
  {
    name: "TooltipContent.side",
    type: '"top" | "right" | "bottom" | "left"',
    note: 'Default "top". Flips automatically when it would overflow.',
  },
  {
    name: "TooltipContent.align",
    type: '"start" | "center" | "end"',
    note: 'Default "center".',
  },
  {
    name: "TooltipContent.sideOffset",
    type: "number",
    note: "Default 0 — the arrow is what creates the gap.",
  },
];
