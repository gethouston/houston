import { SidebarGroupHeader, SidebarRowButton } from "@houston-ai/layout";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { TeamGlyph, TeamMenu } from "./sidebar-group-header-chrome";

/** Team blocks live on the rail, at the rail's width. */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="w-[220px] space-y-2.5 rounded-xl bg-sidebar px-2 py-2">
      {children}
    </div>
  );
}

/** A block holds MEMBERS and nothing else: its destinations are tabs on the
 *  screen its header opens. */
const MEMBERS: readonly string[] = ["Ada", "Kai", "Nova"];

export interface LiveTeamProps {
  name: string;
  /** Start folded. The header stays live either way. */
  startCollapsed?: boolean;
  /** This block owns the open view, so its header wears the pill. */
  owns?: boolean;
  /** The default block passes none: it has no menu, because it stands for the
   *  container and the container cannot be renamed, deleted or left. */
  menu?: boolean;
}

/**
 * A whole block, live: the header and the region it folds.
 *
 * The region is here rather than mocked because it is what makes the folded
 * state legible. Folding hides EVERYTHING under the header, so the header is
 * left carrying both answers: the pill that says the open view belongs here,
 * and the `trailing` badge that rolls up what the hidden rows were signalling.
 *
 * Activating the row FOLDS here. The library takes no position on what a header
 * click means — Houston's own rail opens the team's screen on most clicks and
 * only folds when the user is already on it.
 */
export function LiveTeam({
  name,
  startCollapsed = false,
  owns = false,
  menu = true,
}: LiveTeamProps) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const contentId = useId();

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
        contentId={contentId}
        active={owns}
        onActivate={() => setCollapsed((on) => !on)}
        menu={menu ? <TeamMenu /> : undefined}
      />
      <div id={contentId} className="flex flex-col">
        {!collapsed &&
          MEMBERS.map((member) => (
            <SidebarRowButton key={member} label={member} />
          ))}
      </div>
    </div>
  );
}
