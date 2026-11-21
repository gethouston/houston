import type { ReactNode } from "react";

import type { SpecimenProp } from "../../../src/specimen";

export const rowProps: readonly SpecimenProp[] = [
  {
    name: "icon",
    type: "ReactNode",
    note: "Leading art (~40px): brand logo, letter avatar or glyph tile.",
  },
  { name: "title", type: "string", note: "The row's name. Truncates." },
  {
    name: "description",
    type: "ReactNode",
    note: "One secondary line, truncated. A node when a status replaces it.",
  },
  {
    name: "statusDot",
    type: "ReactNode",
    note: "Always-visible dot left of the title, e.g. <StatusDot />.",
  },
  {
    name: "trailing",
    type: "ReactNode",
    note: "Quiet NON-interactive trailing inside the body: a lock, a badge.",
  },
  {
    name: "action",
    type: "ReactNode",
    note: "Interactive right-edge sibling — its own button, never nested.",
  },
  {
    name: "…rest",
    type: "ComponentPropsWithoutRef<'button'>",
    note: "Lands on the body button: onClick opens the item, disabled fades it.",
  },
  {
    name: "CatalogAddButton.label",
    type: "string",
    note: "Accessible name and title — the plus glyph says nothing.",
  },
  {
    name: "CatalogAddButton.busy",
    type: "boolean",
    note: "Swaps the plus for a spinner at full strength, and disables.",
  },
];

export function Measure({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-md">{children}</div>;
}
