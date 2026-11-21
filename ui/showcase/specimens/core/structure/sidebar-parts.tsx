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

export function SidebarScope({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="min-h-0 w-auto">{children}</SidebarProvider>
  );
}

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
