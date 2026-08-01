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

/**
 * One row of a specimen's props table.
 *
 * `name` is NOT unique within a table: a page that documents a family
 * (`Message` + `MessageContent` + `MessageResponse`, `Conversation` +
 * `ConversationEmptyState`) lists one row per component, and every one of them
 * has its own `children`. The `note` says which component a row belongs to.
 */
export type SpecimenProp = {
  /** The prop name, exactly as the component's TS type spells it. */
  name: string;
  /** Its type, exactly as the component's TS type spells it. */
  type: string;
  /** One short line on what it is for, or its default. */
  note?: string;
};

/**
 * One page of the showcase: a single component, presented in full.
 *
 * A specimen module is a fixed contract, and every file under `specimens/`
 * honours all three parts of it:
 *
 * 1. `export const specimen: Specimen` — the page itself, listed in the
 *    `index.ts` beside it so the registry picks it up.
 * 2. `export const sources: string[]` — the `@houston-ai/*` symbols the page
 *    documents, spelled exactly as a consumer imports them (`["Button"]`,
 *    `["CatalogRow", "CatalogAddButton"]`). `scripts/gen-usage.mjs` reads them
 *    to build `usage.gen.json`, which is what fills the "Used in" row; a page
 *    that omits them fails the generator and `tests/registry.test.ts`.
 * 3. Helper modules beside it (`*-parts.tsx`, `sample.tsx`) export neither, and
 *    are pulled in by the page that uses them.
 */
export type Specimen = {
  /** Kebab-case, globally unique — it is the URL hash, so renames break links. */
  id: string;
  /** The nav label, e.g. `Button`. */
  title: string;
  /** The nav group this page files under. See `SPECIMEN_GROUPS` in registry. */
  group: string;
  /** Renders the page. Full-bleed: `SpecimenPage` owns the frame. */
  render: () => ReactNode;
};

/**
 * The frame every specimen page sits in — the store's measure, gutters and
 * 40/64px block rhythm, so the showcase reads as one document no matter which
 * package a page presents.
 *
 * The masthead and the "Used in" row share one stack slot: the row belongs to
 * the intro, not to the page's blocks, so it sits 16px under it rather than a
 * whole 64px section away.
 */
export function SpecimenPage({
  title,
  intro,
  children,
}: {
  title: string;
  /** One line on what the component is for. Sentence case, no marketing. */
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

/**
 * A titled block of a specimen page — `Variants`, `States`, `Sizes`. The rows
 * inside sit on one flat card: depth is the hairline, never a shadow.
 */
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

/**
 * One labelled row of rendered examples. The label sits in the meta role on a
 * fixed rail so a column of rows scans vertically; the examples wrap with
 * generous gaps rather than compressing.
 */
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

/** The public API, read off the component's TypeScript types. */
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
                // A props table is a static, ordered document — never sorted,
                // never filtered, never appended to at runtime — so the row's
                // position IS its identity. Keying by `name` instead collides
                // the moment a family table lists two components' `children`,
                // and React drops one of the rows.
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

/**
 * The token utilities this component actually paints with, read off its
 * source. A raw colour anywhere in a `ui/` package is a defect, so this list
 * doubles as the audit trail for that rule.
 */
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
