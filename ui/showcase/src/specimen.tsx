import { cn } from "@houston-ai/core";
import {
  StorePage,
  StorePageHeader,
  StoreSection,
  storeSurface,
  storeType,
} from "@houston-ai/store";
import type { ReactNode } from "react";

import { UsedIn } from "./used-in";

export type SpecimenProp = {
  name: string;
  type: string;
  note?: string;
};

export type Specimen = {
  id: string;
  title: string;
  group: string;
  render: () => ReactNode;
};

export function SpecimenPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <StorePage>
      <div className="flex flex-col gap-4">
        <StorePageHeader title={title} subtitle={intro} />
        <UsedIn />
      </div>
      {children}
    </StorePage>
  );
}

export function SpecimenSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <StoreSection title={title} description={note}>
      <div className={cn(storeSurface.card, "flex flex-col gap-6")}>
        {children}
      </div>
    </StoreSection>
  );
}

export function SpecimenRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-line border-b pb-6 last:border-b-0 last:pb-0 md:flex-row md:items-start md:gap-8">
      <span className={cn(storeType.meta, "shrink-0 md:w-44 md:pt-2")}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  );
}

export function SpecimenProps({ items }: { items: readonly SpecimenProp[] }) {
  return (
    <StoreSection
      title="Props"
      description="The public API, read off the component's TypeScript types."
    >
      <div className={cn(storeSurface.panel, "overflow-x-auto p-0")}>
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-line border-b">
              <th className={cn(storeType.meta, "px-6 py-3 font-normal")}>
                Prop
              </th>
              <th className={cn(storeType.meta, "px-6 py-3 font-normal")}>
                Type
              </th>
              <th className={cn(storeType.meta, "px-6 py-3 font-normal")}>
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, row) => (
              <tr
                // biome-ignore lint/suspicious/noArrayIndexKey: position is the row's identity here
                key={`${row}-${item.name}`}
                className="border-line border-b last:border-b-0"
              >
                <td className="px-6 py-3 align-top">
                  <code className={cn(storeType.body, "font-mono")}>
                    {item.name}
                  </code>
                </td>
                <td className="px-6 py-3 align-top">
                  <code className={cn(storeType.meta, "font-mono")}>
                    {item.type}
                  </code>
                </td>
                <td className={cn(storeType.meta, "px-6 py-3 align-top")}>
                  {item.note ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StoreSection>
  );
}

export function SpecimenTokens({ classes }: { classes: readonly string[] }) {
  return (
    <StoreSection
      title="Tokens"
      description="Every colour this component paints resolves a --ht-* token."
    >
      <div className="flex flex-wrap gap-2">
        {classes.map((utility) => (
          <code key={utility} className={cn(storeSurface.chip, "font-mono")}>
            {utility}
          </code>
        ))}
      </div>
    </StoreSection>
  );
}
