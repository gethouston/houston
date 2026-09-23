import type { SpecimenProp } from "../../../src/specimen";

/**
 * `FlowSheet`'s public API, read off `ui/core/src/components/flow-sheet.tsx`.
 * Split out only to keep the specimen file inside the 200-line rule.
 */
export const flowSheetProps: SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Required. Controlled-only — the recipe renders no trigger.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Required. Escape, the overlay and the header's X all arrive here.",
  },
  {
    name: "title",
    type: "string",
    note: "Required. The step's accessible name, and the visible title in a compact frame — so give a compact step the question it asks.",
  },
  {
    name: "size",
    type: '"compact" | "wide"',
    note: 'Which frame THIS step wears; switchable while open. "compact" is the confirm dialog (448px, height from the content), "wide" the tall 672px surface. Defaults to "wide".',
  },
  {
    name: "showTitle",
    type: "boolean",
    note: "wide only: draw the title in the header instead of only naming the dialog. Compact always draws it.",
  },
  {
    name: "back",
    type: "{ label: string; onClick: () => void }",
    note: "The leading slot. One step back — never a second way to close.",
  },
  {
    name: "progress",
    type: "ReactNode",
    note: "The centred slot: a progress bar, dots, or nothing.",
  },
  {
    name: "headerAside",
    type: "ReactNode",
    note: "The right slot, ahead of the X. A step counter, a Skip.",
  },
  {
    name: "footer",
    type: "ReactNode",
    note: "The actions. A pinned bar under the wide body, inline at the foot of a compact one.",
  },
  {
    name: "labels",
    type: "{ close?: string }",
    note: 'English default ("Close"); app/ passes the t() result in.',
  },
  {
    name: "children",
    type: "ReactNode",
    note: "The step. The body scrolls; the frame never moves.",
  },
];
