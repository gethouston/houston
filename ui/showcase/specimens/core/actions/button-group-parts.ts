import type { SpecimenProp } from "../../../src/specimen";

export const buttonGroupProps: readonly SpecimenProp[] = [
  {
    name: "orientation",
    type: '"horizontal" | "vertical"',
    note: "Defaults to `horizontal`. Sets which corners and borders the children drop.",
  },
  {
    name: "...props",
    type: 'React.ComponentProps<"fieldset">',
    note: "It is a fieldset, so `disabled` on the group disables every control inside.",
  },
  {
    name: "ButtonGroupText.asChild",
    type: "boolean",
    note: "Render the child instead of a `<div>`, e.g. to make the label a `<label>`.",
  },
  {
    name: "ButtonGroupSeparator.orientation",
    type: '"horizontal" | "vertical"',
    note: "Defaults to `vertical`: the hairline between two segments of a row.",
  },
];

export const buttonGroupTokens = [
  "bg-chip-subtle",
  "bg-line-input",
  "bg-input",
  "border-line-input",
  "bg-hover",
  "text-hover-text",
  "ring-focus",
];
