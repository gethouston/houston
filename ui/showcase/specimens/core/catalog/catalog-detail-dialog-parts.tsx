import { Check } from "lucide-react";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * The pieces the {@link CatalogDetailDialog} specimen composes: the API table
 * read off the component's types, and one honest example of the `children`
 * slot — the extra detail a consumer stacks between the description and the
 * footer CTA.
 */

export const detailProps: readonly SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Controlled: the consumer owns which item is showing.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on close button, Escape, and outside click.",
  },
  {
    name: "icon",
    type: "ReactNode",
    note: "The item's art (~40px), the same node the row leads with.",
  },
  { name: "title", type: "string", note: "The item's name. Truncates." },
  {
    name: "tags",
    type: "ReactNode",
    note: "Small chips under the title: categories, kind badges.",
  },
  {
    name: "description",
    type: "string",
    note: "The FULL description — this surface exists so it never truncates.",
  },
  {
    name: "children",
    type: "ReactNode",
    note: "Anything extra between the description and the footer.",
  },
  {
    name: "action",
    type: "ReactNode",
    note: "The footer CTA (install / connect), owned by the consumer.",
  },
];

/** Sample `children`: what the item can do, the way a store listing shows it. */
export function DetailCapabilities() {
  return (
    <ul className="flex flex-col gap-2 text-ink-muted text-sm">
      {[
        "Reads receipts from Gmail",
        "Files them by project in your workspace",
        "Sends a monthly summary on the 1st",
      ].map((line) => (
        <li key={line} className="flex items-center gap-2">
          <Check className="size-4 shrink-0 text-success" aria-hidden />
          {line}
        </li>
      ))}
    </ul>
  );
}
