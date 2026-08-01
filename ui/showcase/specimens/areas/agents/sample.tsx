import { Badge, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import type { SidebarGroupView, SidebarItem } from "@houston-ai/layout";
import type { LucideIcon } from "lucide-react";
import { Blocks, LayoutDashboard, Settings, Store } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The **Your Agents** area's shared stand-in content.
 *
 * Every component on this rail is domain-blind — `AppSidebar` takes `icon` and
 * `trailing` nodes, `TabBar` takes labels — so an honest specimen has to feed
 * them exactly what the desktop shell feeds them: `HoustonAvatar` for the agent
 * glyph, a count `Badge` for "needs you", a quiet dot for unread. These are the
 * same shapes `app/src/components/shell/agent-sidebar-status.tsx` builds.
 */

/** The rail's agent glyph: the Houston helmet in the agent's palette colour. */
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

/** "Act on me now": a count chip, the loudest signal a row carries. */
export function NeedsYouChip({ count }: { count: number }) {
  return (
    <Badge
      variant="outline"
      aria-label={`${count} need you`}
      className="h-5 min-w-7 bg-input/90 px-2 font-semibold text-[11px] text-ink/80 leading-none"
    >
      {count}
    </Badge>
  );
}

/** "There is something new here": deliberately a dot, never a count. */
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

/** Four agents a Houston user would actually have, with live-looking signals. */
export const agentItems: SidebarItem[] = [
  {
    id: "inbox-zero",
    name: "Inbox Zero",
    icon: <AgentIcon color="navy" running />,
    trailing: <NeedsYouChip count={3} />,
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

/** Two named groups; Expense Filer stays ungrouped to show the default section. */
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

/** The shell's top-level destinations, in the order `sidebar-chrome.tsx` builds
 *  them (Mission Control, Integrations, Agent Store, Settings). */
export const navEntries: readonly {
  id: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "dashboard", label: "Mission Control", icon: LayoutDashboard },
  { id: "integrations", label: "Integrations", icon: Blocks },
  { id: "store", label: "Agent Store", icon: Store },
  { id: "settings", label: "Settings", icon: Settings },
];

/** The workspaces the switcher lists. */
export const workspaces: readonly { id: string; name: string }[] = [
  { id: "personal", name: "Julian's workspace" },
  { id: "taxflow", name: "Taxflow" },
  { id: "houston", name: "Houston HQ" },
];

/**
 * A bounded stage for a full-height app-frame component. The rail, the tab bar
 * and the split view all size themselves from their parent, so a specimen has
 * to give them a window with a real height or they collapse to nothing.
 */
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
