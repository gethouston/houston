import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { CircleQuestionMark } from "lucide-react";
import type { ReactNode } from "react";
import { tourAnchor } from "./workspace-tour-steps.ts";

export interface SidebarHelpMenuLabels {
  /** Names the control and its menu. */
  help: string;
  guideMe: string;
  reportProblem: string;
}

export interface SidebarHelpMenuProps {
  labels: SidebarHelpMenuLabels;
  /** True while the rail is the icon-only strip. */
  collapsed: boolean;
  /** Arms the guided tour. */
  onGuideMe: () => void;
  /** Opens Settings on its Report bug section. */
  onReportProblem: () => void;
}

/**
 * The rail footer's "?": the two things a stuck user reaches for, behind one
 * control beside the Settings gear.
 *
 * "Guide me" used to be a permanent row in the rail's lead run, sitting among
 * destinations while pointing at no screen — the one entry that could never
 * light, and a standing slot spent on something a user needs once. Asking for
 * help is not a destination, so it wears a help control instead, where every
 * other product puts one: the foot of the navigation, next to settings.
 *
 * "Report a problem" joins it because it answers the same question from the
 * other end. It opens Settings on its Report bug section rather than duplicating
 * that surface: one bug-report screen, two doors, and the one that lives here is
 * the one a user finds while something is going wrong.
 *
 * The trigger wears the library's OWN affordance treatment
 * (`sidebarRowAffordanceClasses`), imported rather than restated — the same
 * class the band's "+" and every team's "..." wear, so the rail's small controls
 * cannot drift apart by being hand-copied. Always visible and muted,
 * strengthening on hover and focus: Houston forbids hover-GATED affordances.
 *
 * Collapsed, it keeps the footer's idiom rather than the row's: the strip has no
 * room for a label, so the glyph is centred under the Settings icon and names
 * itself through a tooltip, exactly as `SidebarNavItem` does there.
 */
export function SidebarHelpMenu({
  labels,
  collapsed,
  onGuideMe,
  onReportProblem,
}: SidebarHelpMenuProps): ReactNode {
  const trigger = (
    <DropdownMenuTrigger
      aria-label={labels.help}
      type="button"
      className={
        collapsed
          ? "flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=open]:bg-hover data-[state=open]:text-ink"
          : sidebarRowAffordanceClasses
      }
      {...tourAnchor("appTour")}
    >
      <CircleQuestionMark className="h-4 w-4" />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {labels.help}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="end" collisionPadding={8} className="w-52">
        {/* One tick AFTER the menu closes, for the same reason the band's
            create menu defers: Radix restores focus to the trigger when its
            content unmounts, and a synchronous handler that mounts an overlay
            (the tour) or moves the view first gets that focus yanked back. */}
        <DropdownMenuItem onSelect={() => setTimeout(onGuideMe, 0)}>
          {labels.guideMe}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTimeout(onReportProblem, 0)}>
          {labels.reportProblem}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
