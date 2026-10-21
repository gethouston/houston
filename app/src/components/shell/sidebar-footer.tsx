import { useUIStore } from "../../stores/ui";
import { ConnectGroup } from "./connect-group";
import { PlanUpgradeRow } from "./plan-upgrade-row";
import { SidebarWorkspaceMenu } from "./sidebar-workspace-menu";
import { UpdateChecker } from "./update-checker";

/**
 * The foot of the rail, under a hairline that sets it off from the team: the
 * update notice when one is waiting, the org's plan entry, the connect rows (`connect-group.tsx`:
 * apps, then AI), then the person's own row (`sidebar-workspace-menu.tsx`),
 * the door to everything that is not an employee or a connection.
 */
export function SidebarFooter(props: {
  collapsed: boolean;
  onCreateWorkspace: () => void;
}) {
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  return (
    <div
      data-testid="sidebar-footer"
      className="flex flex-col border-line border-t pt-2"
    >
      <UpdateChecker collapsed={props.collapsed} />
      <PlanUpgradeRow collapsed={props.collapsed} />
      <ConnectGroup
        collapsed={props.collapsed}
        // Every rail navigation closes the phone's More menu, so a window
        // resized across the breakpoint never lands on a stale open menu.
        onNavigate={() => setMobileMoreOpen(false)}
      />
      <SidebarWorkspaceMenu
        collapsed={props.collapsed}
        onCreateWorkspace={props.onCreateWorkspace}
      />
    </div>
  );
}
