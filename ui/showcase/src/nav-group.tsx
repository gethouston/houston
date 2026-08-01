import { cn } from "@houston-ai/core";
import { storeMotion, storeType } from "@houston-ai/store";
import { ChevronRight } from "lucide-react";

import type { SpecimenGroup } from "./registry";

/** One collapsible subgroup: its heading, then its pages. */
export function NavGroup({
  group,
  open,
  onToggle,
  lockedOpen,
  activeId,
  onSelect,
}: {
  group: SpecimenGroup;
  open: boolean;
  onToggle: () => void;
  /** While filtering the group cannot be shut — the chevron goes quiet. */
  lockedOpen: boolean;
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={lockedOpen}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1 text-left outline-none",
          storeType.meta,
          storeMotion,
          "font-medium text-ink-muted",
          "focus-visible:ring-[3px] focus-visible:ring-focus/50",
          lockedOpen ? "cursor-default" : "hover:text-hover-text",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 shrink-0",
            storeMotion,
            open && "rotate-90",
            lockedOpen && "opacity-0",
          )}
        />
        {group.name}
      </button>

      {open ? (
        group.specimens.length === 0 ? (
          <p className={cn(storeType.meta, "px-3 pt-0.5 pb-1 pl-7.5 italic")}>
            No specimens yet
          </p>
        ) : (
          group.specimens.map((one) => {
            const isActive = one.id === activeId;
            return (
              <button
                key={one.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(one.id)}
                className={cn(
                  "rounded-lg py-1.5 pr-3 pl-7.5 text-left text-[13px] leading-[1.4] outline-none",
                  storeMotion,
                  "focus-visible:ring-[3px] focus-visible:ring-focus/50",
                  isActive
                    ? "bg-chip text-ink"
                    : "text-ink-muted hover:bg-hover hover:text-hover-text",
                )}
              >
                {one.title}
              </button>
            );
          })
        )
      ) : null}
    </div>
  );
}
