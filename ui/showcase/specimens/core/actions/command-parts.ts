import type { SpecimenProp } from "../../../src/specimen";

/**
 * The command page's tables, split out so the page stays under the 200-line
 * rule. Read off `ui/core/src/components/command.tsx`; the behavioural props
 * belong to cmdk, the surface is ours.
 */
export const commandProps: readonly SpecimenProp[] = [
  {
    name: "Command.filter",
    type: "(value: string, search: string, keywords?: string[]) => number",
    note: "cmdk's scorer. `defaultFilter` is re-exported so you can wrap it (fold diacritics, say) without depending on cmdk directly.",
  },
  {
    name: "Command.shouldFilter",
    type: "boolean",
    note: "Set `false` when the results come from a server and are already ranked.",
  },
  {
    name: "CommandInput.value / onValueChange",
    type: "string / (value: string) => void",
    note: "The search box. Controlled or uncontrolled.",
  },
  {
    name: "CommandItem.value",
    type: "string",
    note: "What the filter matches against. Set it when the label is JSX.",
  },
  {
    name: "CommandItem.onSelect",
    type: "(value: string) => void",
    note: "Fires on click and on Enter.",
  },
  {
    name: "CommandItem.disabled",
    type: "boolean",
    note: "Half opacity, skipped by the arrow keys.",
  },
  {
    name: "CommandGroup.heading",
    type: "ReactNode",
    note: "The group label, in `ink-muted`.",
  },
  {
    name: "CommandDialog.title / description",
    type: "string",
    note: "Screen-reader only. Default to “Command Palette” / “Search for a command to run...”.",
  },
  {
    name: "CommandDialog.showCloseButton",
    type: "boolean",
    note: "Defaults to `true`. Plus every Dialog prop: `open`, `onOpenChange`.",
  },
];

export const commandTokens = [
  "bg-popover",
  "text-popover-text",
  "text-ink",
  "text-ink-muted",
  "bg-hover",
  "text-hover-text",
  "bg-line",
  "border-line",
];
