import { SidebarNavItem } from "@houston-ai/layout";
import { Building2, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { openAdmin } from "../../lib/open-admin";
import {
  ACADEMY_VIEW_ID,
  ADMIN_VIEW_ID,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import { academyNavRow } from "./sidebar-nav-rows";
import { UpdateChecker } from "./update-checker";
import { tourAnchor } from "./workspace-tour-steps.ts";

/**
 * The foot of the rail: Academy, Admin, Settings.
 *
 * The Academy leads the cluster: learning to fly is neither an hourly
 * destination nor a preference (`sidebar-nav-rows.tsx` builds the row; the
 * phone's More menu draws the same one). Admin sits directly above Settings
 * and only for a caller the org gate admits (`showOrganization`), including
 * callers in Spaces personal spaces. Settings is the rail's LAST row and the
 * one door onto the person's own setup; identity lives inside it
 * (`settings/identity-header.tsx`).
 *
 * Every row is a `SidebarNavItem`, the component every other destination
 * renders through, so `collapsed` gives each the icon-rail anatomy for free.
 */
export function SidebarFooter(props: { collapsed: boolean }) {
  const { t } = useTranslation("shell");
  const { showOrganization } = useSurfaceGates();
  const viewMode = useUIStore((s) => s.viewMode);
  const openSettings = useUIStore((s) => s.openSettings);
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const academy = academyNavRow({
    label: t("sidebar.academy"),
    onOpen: () => {
      setViewMode(ACADEMY_VIEW_ID);
      setMobileMoreOpen(false);
    },
  });
  return (
    <div data-testid="sidebar-footer" className="flex flex-col">
      <UpdateChecker collapsed={props.collapsed} />
      <div
        className={
          props.collapsed ? "flex flex-col items-center px-2 pb-1" : "px-2 pb-1"
        }
      >
        <SidebarNavItem
          icon={academy.icon}
          label={academy.label}
          active={viewMode === ACADEMY_VIEW_ID}
          collapsed={props.collapsed}
          onClick={academy.onClick}
          dataAttrs={academy.dataAttrs}
        />
        {showOrganization && (
          <SidebarNavItem
            icon={<Building2 className="h-4 w-4" />}
            label={t("sidebar.admin")}
            active={viewMode === ADMIN_VIEW_ID}
            collapsed={props.collapsed}
            dataAttrs={{ "data-testid": "rail-admin" }}
            onClick={() => openAdmin()}
          />
        )}
        <SidebarNavItem
          icon={<Settings className="h-4 w-4" />}
          label={t("sidebar.settings")}
          active={viewMode === SETTINGS_VIEW_ID}
          collapsed={props.collapsed}
          dataAttrs={tourAnchor("nav-settings")}
          onClick={() => {
            // Open Settings on its INDEX, never plain `setViewMode("settings")`:
            // that is a dead click while a section is already open.
            openSettings(null);
            setMobileMoreOpen(false);
          }}
        />
      </div>
    </div>
  );
}
