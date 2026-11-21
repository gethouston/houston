import { cn } from "@houston-ai/core";
import { storeSurface, storeType } from "@houston-ai/store";
import { createContext, type ReactNode, useContext } from "react";

import usage from "./usage.gen.json";

type Usage = { surfaces: string[]; fileCount: number };

const USAGE: Record<string, Usage> = usage;

const SpecimenIdContext = createContext<string | undefined>(undefined);

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
