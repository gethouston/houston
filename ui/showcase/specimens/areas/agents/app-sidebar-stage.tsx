import {
  Avatar,
  AvatarFallback,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import {
  AppSidebar,
  SidebarAddRow,
  sidebarHeaderControlClasses,
  useSidebarAvatarDiameter,
} from "@houston-ai/layout";
import { Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Viewport } from "./sample";

export function BlockRollup({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      role="img"
      aria-label={`${count} inside`}
      title={`${count} inside`}
      className="rounded-full bg-input/90 px-2 text-[11px] text-ink/80 leading-5"
    >
      {count}
    </span>
  );
}

export function SidebarStage({ children }: { children: ReactNode }) {
  return (
    <Viewport className="h-[520px] w-full max-w-2xl">
      {children}
      <div className="flex flex-1 items-center justify-center p-6 text-center text-ink-muted text-xs">
        The agent's workspace: whatever the selected rail row opens.
      </div>
    </Viewport>
  );
}

function HeaderControl(props: {
  label: string;
  icon: ReactNode;
  collapsed: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={props.label}
          className={sidebarHeaderControlClasses}
        >
          {props.icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side={props.collapsed ? "right" : "bottom"}>
        {props.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function RailActions({ collapsed }: { collapsed: boolean }) {
  return (
    <>
      <HeaderControl
        label="Search"
        icon={<Search className="size-4" />}
        collapsed={collapsed}
      />
      <HeaderControl
        label="Create"
        icon={<Plus className="size-4" />}
        collapsed={collapsed}
      />
    </>
  );
}

export function Portrait({ initials }: { initials: string }) {
  const diameter = useSidebarAvatarDiameter();
  return (
    <Avatar style={{ width: diameter, height: diameter }}>
      <AvatarFallback className="text-xs font-medium">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function AddEmployee({ collapsed }: { collapsed: boolean }) {
  return (
    <SidebarAddRow
      label="Add new AI Employee"
      onClick={() => {}}
      collapsed={collapsed}
    />
  );
}

export function EmptyRail() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <AppSidebar
      headerActions={<RailActions collapsed={false} />}
      items={[]}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}
