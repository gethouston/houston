import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@houston-ai/core";
import {
  SidebarConnectGroup,
  type SidebarConnectRow,
  SidebarProfileMenu,
} from "@houston-ai/layout";
import {
  Bot,
  BrainCircuit,
  Calendar,
  Check,
  CircleUserRound,
  GraduationCap,
  HardDrive,
  LogOut,
  Mail,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { Portrait } from "./app-sidebar-stage";
import { workspaces } from "./sample";

export function Who() {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-ink text-sm">Julian Arango</span>
      <span className="truncate text-ink-muted text-xs">
        julian@example.com
      </span>
    </span>
  );
}

export const connectRows: SidebarConnectRow[] = [
  {
    id: "apps",
    label: "Connect your apps",
    logos: [
      { id: "mail", element: <Mail className="text-ink" /> },
      { id: "calendar", element: <Calendar className="text-ink" /> },
      { id: "drive", element: <HardDrive className="text-ink" /> },
    ],
    onClick: () => {},
  },
  {
    id: "ai",
    label: "Connect your AI",
    logos: [
      { id: "sparkles", element: <Sparkles className="text-ink" /> },
      { id: "bot", element: <Bot className="text-ink" /> },
      { id: "brain", element: <BrainCircuit className="text-ink" /> },
    ],
    onClick: () => {},
  },
];

export function RailFoot({ collapsed }: { collapsed: boolean }) {
  const [workspaceId, setWorkspaceId] = useState("personal");
  const current =
    workspaces.find((one) => one.id === workspaceId) ?? workspaces[0];
  return (
    <div className="flex flex-col border-line border-t pt-2">
      <SidebarConnectGroup rows={connectRows} collapsed={collapsed} />
      <SidebarProfileMenu
        avatar={<Portrait initials="JA" />}
        title="Julian Arango"
        subtitle={current.name}
        collapsed={collapsed}
      >
        <DropdownMenuLabel className="font-normal">
          <Who />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((one) => (
          <DropdownMenuItem
            key={one.id}
            onSelect={() => setWorkspaceId(one.id)}
          >
            {one.id === workspaceId ? (
              <Check className="size-4" />
            ) : (
              <span className="size-4" />
            )}
            {one.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <CircleUserRound className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem>
          <UserRound className="size-4" />
          About me
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <GraduationCap className="size-4" />
          Academy
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </SidebarProfileMenu>
    </div>
  );
}
