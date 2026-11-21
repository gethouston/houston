import {
  Kbd,
  KbdGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { sidebarHeaderControlClasses } from "@houston-ai/layout";
import { Search } from "lucide-react";
import { shortcutParts } from "../../lib/shortcuts";
import { useUIStore } from "../../stores/ui";
import type { SidebarChromeT } from "./sidebar-chrome";
import { SidebarCreateButton } from "./sidebar-create-button";
import { tourAnchor } from "./workspace-tour-steps.ts";

export function SidebarHeaderActions(props: {
  t: SidebarChromeT;
  collapsed: boolean;
  onNewAgent: (() => void) | undefined;
  onNewTeam: (() => void) | undefined;
}) {
  const { t, collapsed } = props;
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const side = collapsed ? "right" : "bottom";
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("shell:sidebar.search")}
            data-testid="rail-search"
            onClick={() => setPaletteOpen(true)}
            className={sidebarHeaderControlClasses}
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="flex items-center gap-2">
          {t("shell:sidebar.search")}
          <KbdGroup>
            {shortcutParts("palette").map((part) => (
              <Kbd key={part}>{part}</Kbd>
            ))}
          </KbdGroup>
        </TooltipContent>
      </Tooltip>
      <SidebarCreateButton
        labels={{
          title: t("shell:sidebar.createDialog"),
          newAgent: t("shell:sidebar.addAgent"),
          newTeam: t("shell:sidebar.newTeam"),
        }}
        onNewAgent={props.onNewAgent}
        onNewTeam={props.onNewTeam}
        collapsed={collapsed}
        dataAttrs={tourAnchor("newAgent")}
      />
    </>
  );
}
