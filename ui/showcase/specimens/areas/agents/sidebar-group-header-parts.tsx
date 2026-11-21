import { SidebarGroupHeader, SidebarRowButton } from "@houston-ai/layout";
import type { ReactNode } from "react";
import { useState } from "react";

import { TeamGlyph } from "./sidebar-group-header-chrome";

export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="w-[272px] space-y-2.5 rounded-xl bg-sidebar px-2 py-2">
      {children}
    </div>
  );
}

const MEMBERS: readonly string[] = ["Ada", "Kai", "Nova"];

export interface LiveTeamProps {
  name: string;
  startCollapsed?: boolean;
  owns?: boolean;
}

export function LiveTeam({
  name,
  startCollapsed = false,
  owns = false,
}: LiveTeamProps) {
  const [collapsed, setCollapsed] = useState(startCollapsed);

  return (
    <div className="flex flex-col">
      <SidebarGroupHeader
        name={name}
        icon={<TeamGlyph />}
        trailing={
          collapsed ? (
            <span className="rounded-full bg-input/90 px-2 text-[11px] text-ink/80 leading-5">
              {MEMBERS.length}
            </span>
          ) : undefined
        }
        collapsed={collapsed}
        active={owns}
        onActivate={() => setCollapsed((on) => !on)}
      />
      <div className="flex flex-col">
        {!collapsed &&
          MEMBERS.map((member) => (
            <SidebarRowButton key={member} label={member} />
          ))}
      </div>
    </div>
  );
}
