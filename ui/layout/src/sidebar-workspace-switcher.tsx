import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { sidebarSheetRowClasses } from "./sidebar-surface";

export interface SidebarWorkspaceSwitcherProps {
  title: string;
  header?: ReactNode;
  children: ReactNode;
  dataAttrs?: Record<string, string>;
}

export function SidebarWorkspaceSwitcher({
  title,
  header,
  children,
  dataAttrs,
}: SidebarWorkspaceSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          {...(dataAttrs ?? {})}
          className={sidebarSheetRowClasses}
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-muted"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="w-60"
      >
        {header && (
          <>
            <DropdownMenuLabel className="font-normal">
              {header}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
