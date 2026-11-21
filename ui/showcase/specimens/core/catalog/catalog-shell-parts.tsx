import {
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogSearchField,
  Skeleton,
  StatusDot,
} from "@houston-ai/core";
import type { ReactNode } from "react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { SampleIcon, type SampleItem } from "./sample";

export const shellProps: readonly SpecimenProp[] = [
  {
    name: "controls",
    type: "ReactNode",
    note: "The one search-and-filters row. Rendered sticky; omit for no bar.",
  },
  {
    name: "installed",
    type: "ReactNode",
    note: "The installed strip. Omit to drop the whole section.",
  },
  { name: "installedTitle", type: "string", note: "Heading over the strip." },
  {
    name: "installedCount",
    type: "number",
    note: "Matches while filtering, the total at rest; omit to hide the chip.",
  },
  {
    name: "availableTitle",
    type: "string",
    note: "Heading over discovery. Omit to render the tabs bare.",
  },
  {
    name: "availableCount",
    type: "number | string",
    note: "A string renders verbatim, e.g. 9000+.",
  },
  {
    name: "tabs",
    type: "CatalogShellTab[]",
    note: "{ value, label, count?, content }. One tab drops the chrome, none drops the section.",
  },
  {
    name: "value / onValueChange",
    type: "string / (value: string) => void",
    note: "Controlled active tab, so strip rows can switch tabs.",
  },
  {
    name: "CATALOG_INSTALLED_PREVIEW_CAP",
    type: "number",
    note: "Exported constant: 6 rows at rest before a Show all expander.",
  },
];

export function ShellViewport({ children }: { children: ReactNode }) {
  return (
    <div className="h-80 w-full overflow-y-auto rounded-2xl border border-line bg-gutter px-4 pb-4">
      {children}
    </div>
  );
}

export function ShellControls() {
  const [query, setQuery] = useState("");
  return (
    <CatalogSearchField value={query} onChange={setQuery} label="Search" />
  );
}

export function AvailableRows({ items }: { items: readonly SampleItem[] }) {
  return (
    <CatalogGrid>
      {items.map((item) => (
        <CatalogRow
          key={item.title}
          icon={<SampleIcon icon={item.icon} />}
          title={item.title}
          description={item.description}
          action={<CatalogAddButton label={`Install ${item.title}`} />}
        />
      ))}
    </CatalogGrid>
  );
}

export function InstalledRows({ items }: { items: readonly SampleItem[] }) {
  return (
    <CatalogGrid>
      {items.map((item) => (
        <CatalogRow
          key={item.title}
          icon={<SampleIcon icon={item.icon} />}
          title={item.title}
          description={item.description}
          statusDot={<StatusDot status="active" srLabel="Installed" />}
        />
      ))}
    </CatalogGrid>
  );
}

export function InstalledSkeleton() {
  return (
    <CatalogGrid>
      {["a", "b"].map((key) => (
        <div key={key} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </CatalogGrid>
  );
}
