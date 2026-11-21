import type { ReactNode } from "react";
import { HeaderSearch } from "./header-search";

export function HeaderToolsRow({
  inStrip,
  search,
  children,
}: {
  inStrip: boolean;
  search: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={
        inStrip
          ? "flex items-center gap-2"
          : "mb-8 flex flex-wrap items-center gap-2 pt-2"
      }
    >
      <HeaderSearch inStrip={inStrip}>{search}</HeaderSearch>
      {children}
    </div>
  );
}

export function headerSearchFieldClass(inStrip: boolean): string {
  return inStrip ? "[&_input]:h-8" : "w-full";
}
