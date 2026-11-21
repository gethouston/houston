import { useUIStore } from "../../stores/ui";
import { ConnectGroup } from "./connect-group";
import { PlanUpgradeRow } from "./plan-upgrade-row";
import { SidebarWorkspaceMenu } from "./sidebar-workspace-menu";
import { UpdateChecker } from "./update-checker";

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
        onNavigate={() => setMobileMoreOpen(false)}
      />
      <SidebarWorkspaceMenu
        collapsed={props.collapsed}
        onCreateWorkspace={props.onCreateWorkspace}
      />
    </div>
  );
}
