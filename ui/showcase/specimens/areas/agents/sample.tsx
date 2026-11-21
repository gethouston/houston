import {
  HoustonAvatar,
  ManagerAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import {
  type SidebarGroupView,
  type SidebarItem,
  useSidebarAvatarDiameter,
} from "@houston-ai/layout";
import { Users } from "lucide-react";
import type { ReactNode } from "react";

export function AgentIcon({
  color,
  running,
}: {
  color: string;
  running?: boolean;
}) {
  return (
    <HoustonAvatar
      color={resolveAgentColor(color)}
      diameter={20}
      running={running}
    />
  );
}

export function TeamIcon() {
  return <Users className="size-4" />;
}

export function UnreadDot() {
  return (
    <span
      role="img"
      aria-label="Unread activity"
      title="Unread activity"
      className="flex size-3 shrink-0 items-center justify-center"
    >
      <span className="size-1.5 rounded-full bg-action" />
    </span>
  );
}

function ManagerIcon() {
  return <ManagerAvatar size={useSidebarAvatarDiameter()} />;
}

export const managerItem: SidebarItem = {
  id: "houston",
  name: "Houston",
  subtitle: "Your AI Manager",
  icon: <ManagerIcon />,
};

export const agentItems: SidebarItem[] = [
  {
    id: "inbox-zero",
    name: "Inbox Zero",
    icon: <AgentIcon color="navy" running />,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    icon: <AgentIcon color="forest" />,
    trailing: <UnreadDot />,
  },
  {
    id: "weekly-report",
    name: "Weekly Report",
    icon: <AgentIcon color="golden" />,
  },
  {
    id: "expense-filer",
    name: "Expense Filer",
    icon: <AgentIcon color="crimson" />,
  },
];

export const agentGroups: SidebarGroupView[] = [
  {
    id: "mornings",
    name: "Mornings",
    collapsed: false,
    itemIds: ["inbox-zero", "meeting-notes"],
  },
  {
    id: "finance",
    name: "Finance",
    collapsed: true,
    itemIds: ["weekly-report"],
  },
];

export const workspaces: readonly { id: string; name: string }[] = [
  { id: "personal", name: "Julian's workspace" },
  { id: "taxflow", name: "Taxflow" },
  { id: "houston", name: "Houston HQ" },
];

export function Viewport({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex overflow-hidden rounded-2xl border border-line bg-gutter ${className ?? "h-[420px]"}`}
    >
      {children}
    </div>
  );
}
