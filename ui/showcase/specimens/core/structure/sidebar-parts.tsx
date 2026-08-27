import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
} from "@houston-ai/core";
import {
  Bot,
  Clock,
  Inbox,
  MoreHorizontal,
  Plus,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Every sidebar part reads `useSidebar()`, so each example needs a provider.
 * The provider's own frame is a full-viewport flex column; here it is clamped
 * to the row it sits in (`min-h-0 w-auto`) so a specimen row stays a row.
 */
export function SidebarScope({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="min-h-0 w-auto">{children}</SidebarProvider>
  );
}

/** A sidebar-coloured plate to show loose menu parts on, at the real width. */
export function SidebarPlate({ children }: { children: ReactNode }) {
  return (
    <SidebarScope>
      <div className="w-64 rounded-xl border border-sidebar-line bg-sidebar p-2 text-sidebar-text">
        <SidebarMenu>{children}</SidebarMenu>
      </div>
    </SidebarScope>
  );
}

const agents = [
  { name: "Inbox Zero", icon: Inbox, badge: "6" },
  { name: "Meeting Notes", icon: Clock, badge: undefined },
  { name: "Weekly Report", icon: Bot, badge: "2" },
];

/**
 * The whole composition, in a bounded frame. `collapsible="none"` is the one
 * mode that lays out in flow — the other two pin the sidebar to the viewport
 * with `position: fixed` and `h-dvh`, which only works in a real app shell.
 */
export function ComposedSidebar() {
  return (
    <SidebarScope>
      <div className="h-[26rem] w-64 overflow-hidden rounded-xl border border-sidebar-line">
        <Sidebar collapsible="none">
          <SidebarHeader>
            <SidebarInput placeholder="Search agents" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Agents</SidebarGroupLabel>
              <SidebarGroupAction aria-label="New agent">
                <Plus />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  {agents.map((agent, index) => (
                    <SidebarMenuItem key={agent.name}>
                      <SidebarMenuButton isActive={index === 0}>
                        <agent.icon />
                        <span>{agent.name}</span>
                      </SidebarMenuButton>
                      {agent.badge ? (
                        <SidebarMenuBadge>{agent.badge}</SidebarMenuBadge>
                      ) : (
                        <SidebarMenuAction
                          showOnHover
                          aria-label={`More for ${agent.name}`}
                        >
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Recent runs</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Clock />
                      <span>Today</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton isActive>
                          Run 142
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton size="sm">
                          Run 141
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">
                  <Settings />
                  <span>@julian · Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      </div>
    </SidebarScope>
  );
}
