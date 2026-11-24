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
  /** The workspace's name: the row's words and its accessible name. */
  title: string;
  /** Who is signed in, heading the open menu above the host's items. Not
   *  interactive; absent when there is no identity to show. */
  header?: ReactNode;
  /** The menu's items, host-owned (`DropdownMenuItem`s, separators). */
  children: ReactNode;
  /** DOM attributes (tour anchor, test id) on the trigger button. */
  dataAttrs?: Record<string, string>;
}

/**
 * Which workspace this is, as the head row of a phone card (Houston's More
 * card): the workspace's name and an up-down chevron saying it switches, on
 * the card's own row (`sidebarSheetRowClasses`). No mark: the name is the
 * identity. Pressing it opens the workspace menu downward, headed by who is
 * signed in. The desktop rail names the workspace on its account row
 * instead (`SidebarProfileMenu`).
 */
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
