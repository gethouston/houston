import { SidebarNavItem } from "@houston-ai/layout";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRunGuidedSetup } from "../../hooks/use-run-guided-setup";
import { SETTINGS_VIEW_ID } from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import { SidebarHelpMenu } from "./sidebar-help-menu";
import { tourAnchor } from "./workspace-tour-steps.ts";

/**
 * The foot of the rail: Settings and the help control beside it.
 *
 * **Settings lives here, not in the "Workspace" band.** That band is what the
 * SPACE is made of, and it is owner territory; Settings belongs to the
 * PERSON's chrome, which is why it sits with the account. It also has to be
 * reachable in every deployment mode, including the ones where the Workspace
 * band does not exist at all — a plain member passes none of that band's
 * gates, so the library drops the band and every row in it.
 *
 * **The help control sits beside it** (`sidebar-help-menu.tsx`): "Guide me" and
 * "Report a problem", the two things a stuck user reaches for. "Guide me" used
 * to be a permanent row in the rail's lead run, the one entry pointing at no
 * screen and therefore the one that could never light. Asking for help is not a
 * destination, so it wears a help control at the foot of the navigation instead
 * of a slot among the destinations. What it runs is the shared
 * {@link useRunGuidedSetup}, the same composition the Academy's setup chapter
 * spends, so the guided setup can never start two different ways.
 *
 * Settings is the rail's LAST row. The avatar menu that used to close the rail
 * is gone: once Settings became a permanent row here, a second control opening
 * "Account settings" was a second door onto the same page. Identity moved INTO
 * that page, where the Settings index now opens on the signed-in person's face,
 * email and Sign out (`settings/identity-header.tsx`).
 *
 * The row is drawn with `SidebarNavItem` — the same component `SidebarNavList`
 * renders every other destination through — so it is a rail row rather than a
 * lookalike, and `collapsed` gives it the icon-rail anatomy for free. The help
 * control follows it in the same direction: beside the row while the rail is
 * expanded, stacked under the glyph while it is the icon strip.
 */
export function SidebarFooter(props: { collapsed: boolean }) {
  const { t } = useTranslation("shell");
  const viewMode = useUIStore((s) => s.viewMode);
  const openSettings = useUIStore((s) => s.openSettings);
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  const runGuidedSetup = useRunGuidedSetup();
  return (
    <div className="flex flex-col">
      <div
        className={
          props.collapsed
            ? "flex flex-col items-center gap-1 px-2 pb-1"
            : "flex items-center gap-1 px-2 pb-1"
        }
      >
        <div className={props.collapsed ? undefined : "min-w-0 flex-1"}>
          <SidebarNavItem
            icon={<Settings className="h-4 w-4" />}
            label={t("sidebar.settings")}
            active={viewMode === SETTINGS_VIEW_ID}
            collapsed={props.collapsed}
            dataAttrs={tourAnchor("nav-settings")}
            onClick={() => {
              // Open Settings on its INDEX, never plain
              // `setViewMode("settings")` — that is a dead click while a
              // section is already open, leaving the user staring at the
              // section they wanted to leave.
              openSettings(null);
              setMobileMoreOpen(false);
            }}
          />
        </div>
        <SidebarHelpMenu
          collapsed={props.collapsed}
          labels={{
            help: t("sidebar.help"),
            guideMe: t("sidebar.guideMe"),
            reportProblem: t("sidebar.reportProblem"),
          }}
          onGuideMe={() => {
            setMobileMoreOpen(false);
            runGuidedSetup();
          }}
          onReportProblem={() => {
            // The one bug-report surface, reached from the place a user is
            // standing when something goes wrong rather than duplicated here.
            openSettings("reportBug");
            setMobileMoreOpen(false);
          }}
        />
      </div>
    </div>
  );
}
