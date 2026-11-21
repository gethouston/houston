import { Badge, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { SidebarRowButton } from "@houston-ai/layout";
import { Folder, LayoutDashboard, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { SIDEBAR_ROW_CONSUMERS } from "./sidebar-row-button-api";

export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="w-[272px] rounded-xl bg-sidebar px-2 py-2">{children}</div>
  );
}

export function Ladder() {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [openId, setOpenId] = useState("mission-control");
  return (
    <Rail>
      <SidebarRowButton
        label="Operations"
        depth="block"
        icon={<Users className="size-4" />}
        draggable
        onActivate={() => setCollapsed((on) => !on)}
        disclosure={{ expanded: !collapsed, contentId }}
      />
      <div id={contentId}>
        {!collapsed && (
          <>
            <SidebarRowButton
              label="Mission Control"
              icon={<LayoutDashboard className="size-4" />}
              active={openId === "mission-control"}
              onActivate={() => setOpenId("mission-control")}
            />
            <SidebarRowButton
              label="Files"
              icon={<Folder className="size-4" />}
              active={openId === "files"}
              onActivate={() => setOpenId("files")}
            />
            <SidebarRowButton
              label="Ops Runner"
              icon={
                <HoustonAvatar
                  color={resolveAgentColor("navy")}
                  diameter={20}
                />
              }
              draggable
              active={openId === "ops"}
              onActivate={() => setOpenId("ops")}
              trailing={<Badge variant="outline">2</Badge>}
            />
            <SidebarRowButton
              label="Ana the analyst with a very long name"
              icon={
                <HoustonAvatar
                  color={resolveAgentColor("forest")}
                  diameter={20}
                />
              }
              draggable
              active={openId === "ana"}
              onActivate={() => setOpenId("ana")}
            />
          </>
        )}
      </div>
    </Rail>
  );
}

export function ConsumerList() {
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {SIDEBAR_ROW_CONSUMERS.map((one) => (
        <li key={one.who} className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{one.who}</span>
          <span className="text-ink-muted">{one.what}</span>
        </li>
      ))}
    </ul>
  );
}
