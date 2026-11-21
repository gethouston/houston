import { ManagerAvatar } from "@houston-ai/core";
import { type SidebarItem, useSidebarAvatarDiameter } from "@houston-ai/layout";
import { useManagerReachable } from "../../hooks/use-manager-reachable";
import { useUIStore } from "../../stores/ui";
import { ASSISTANT_VIEW_ID } from "../assistant/id";
import type { SidebarChromeT } from "./sidebar-chrome";
import { bandSelectedId, routeBandSelect } from "./sidebar-manager-selection";

function ManagerSidebarIcon() {
  return <ManagerAvatar size={useSidebarAvatarDiameter()} />;
}

export function useSidebarManagerRow(args: {
  t: SidebarChromeT;
  selectedAgentId: string | null;
  selectAgent: (agentId: string) => void;
  closeMobileMenu: () => void;
}): {
  pinnedItems: SidebarItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
} {
  const { t, selectedAgentId, selectAgent, closeMobileMenu } = args;
  const reachable = useManagerReachable();
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const pinnedItems: SidebarItem[] = reachable
    ? [
        {
          id: ASSISTANT_VIEW_ID,
          name: t("shell:sidebar.assistant"),
          subtitle: t("shell:sidebar.assistantRole"),
          icon: <ManagerSidebarIcon />,
          dataAttrs: { "data-testid": "rail-assistant" },
        },
      ]
    : [];
  return {
    pinnedItems,
    selectedId: bandSelectedId(viewMode, selectedAgentId),
    onSelect: (id) =>
      routeBandSelect(id, {
        openManager: () => {
          setViewMode(ASSISTANT_VIEW_ID);
          closeMobileMenu();
        },
        selectAgent,
      }),
  };
}
