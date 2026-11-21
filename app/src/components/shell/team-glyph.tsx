import { resolveAgentColor } from "@houston-ai/core";
import {
  isSidebarGroupGlyph,
  SidebarGroupGlyph,
  sidebarMarkSize,
} from "@houston-ai/layout";
import { Users } from "lucide-react";
import type { ReactElement } from "react";
import { teamDisplayColor, teamDisplayIcon } from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";

export function TeamGlyph({
  team,
  className = sidebarMarkSize.glyph,
}: {
  team: TeamView;
  className?: string;
}): ReactElement {
  const icon = teamDisplayIcon(team);
  const color = teamDisplayColor(team);
  const mark =
    icon && isSidebarGroupGlyph(icon) ? (
      <SidebarGroupGlyph name={icon} className={className} />
    ) : (
      <Users className={className} />
    );
  return (
    <span
      className="flex"
      style={color ? { color: resolveAgentColor(color) } : undefined}
    >
      {mark}
    </span>
  );
}
