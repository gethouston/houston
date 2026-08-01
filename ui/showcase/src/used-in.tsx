import { cn } from "@houston-ai/core";
import { storeSurface, storeType } from "@houston-ai/store";
import { createContext, type ReactNode, useContext } from "react";

import usage from "./usage.gen.json";

/** `{ surfaces, fileCount }` for a specimen, or nothing if nothing uses it. */
type Usage = { surfaces: string[]; fileCount: number };

/**
 * The generated map, keyed by specimen id. Built from real import statements by
 * `scripts/gen-usage.mjs` and checked in, so it cannot drift into a lie — a
 * stale file fails `tests/usage.test.ts` rather than misinforming a reader.
 */
const USAGE: Record<string, Usage> = usage;

/**
 * The id of the specimen currently being rendered.
 *
 * The showcase provides it around `specimen.render()` so `SpecimenPage` can
 * find the page's usage without every one of the 50-odd pages repeating its own
 * id as a prop. Outside a provider the "Used in" row simply does not render.
 */
const SpecimenIdContext = createContext<string | undefined>(undefined);

/** Wraps a rendered specimen so its page can look its own usage up. */
export function SpecimenIdProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <SpecimenIdContext.Provider value={id}>
      {children}
    </SpecimenIdContext.Provider>
  );
}

/**
 * Where the product actually uses this component: one chip per surface, then
 * the file count. Deliberately quiet — it is provenance under the intro, not a
 * headline, so it borrows the chip and meta roles and adds no colour of its own.
 *
 * Renders nothing for a component no surface consumes yet.
 */
export function UsedIn() {
  const id = useContext(SpecimenIdContext);
  const found = id ? USAGE[id] : undefined;
  if (!found) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className={cn(storeType.meta, "shrink-0")}>Used in</span>
      {found.surfaces.map((surface) => (
        <span key={surface} className={cn(storeSurface.chip, "py-0.5")}>
          {surface}
        </span>
      ))}
      <span className={cn(storeType.meta, "shrink-0 tabular-nums")}>
        {found.fileCount} {found.fileCount === 1 ? "file" : "files"}
      </span>
    </div>
  );
}
