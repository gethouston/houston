import {
  SidebarConnectGroup,
  type SidebarConnectRow,
  type SidebarSurface,
} from "@houston-ai/layout";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import type { NavMode } from "../../lib/nav-stack";
import {
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
} from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import {
  useConnectAiLogos,
  useConnectAppsLogos,
} from "./use-connect-group-logos";
import { tourAnchor } from "./workspace-tour-steps";

interface ConnectGroupProps {
  collapsed: boolean;
  surface?: SidebarSurface;
  nav?: NavMode;
  onNavigate: () => void;
}

function useAppsRow(props: ConnectGroupProps): SidebarConnectRow {
  const { t } = useTranslation("shell");
  const open = useOpen(props);
  const viewMode = useUIStore((s) => s.viewMode);
  return {
    id: INTEGRATIONS_VIEW_ID,
    label: t("sidebar.connectApps"),
    logos: useConnectAppsLogos(),
    onClick: () => open(INTEGRATIONS_VIEW_ID),
    selected: viewMode === INTEGRATIONS_VIEW_ID,
    dataAttrs: tourAnchor("nav-integrations"),
  };
}

function useAiRow(props: ConnectGroupProps): SidebarConnectRow {
  const { t } = useTranslation("shell");
  const open = useOpen(props);
  const viewMode = useUIStore((s) => s.viewMode);
  return {
    id: AI_HUB_VIEW_ID,
    label: t("sidebar.connectAi"),
    logos: useConnectAiLogos(),
    onClick: () => open(AI_HUB_VIEW_ID),
    selected: viewMode === AI_HUB_VIEW_ID,
    dataAttrs: tourAnchor("nav-ai-hub"),
  };
}

function useOpen(props: ConnectGroupProps): (view: string) => void {
  const setViewMode = useUIStore((s) => s.setViewMode);
  return (view) => {
    setViewMode(view, props.nav ? { nav: props.nav } : undefined);
    props.onNavigate();
  };
}

function AppsOnly(props: ConnectGroupProps) {
  return (
    <SidebarConnectGroup
      rows={[useAppsRow(props)]}
      collapsed={props.collapsed}
      surface={props.surface}
    />
  );
}

function AppsAndAi(props: ConnectGroupProps) {
  const apps = useAppsRow(props);
  const ai = useAiRow(props);
  return (
    <SidebarConnectGroup
      rows={[apps, ai]}
      collapsed={props.collapsed}
      surface={props.surface}
    />
  );
}

export function ConnectGroup(props: ConnectGroupProps) {
  const { showAiModels } = useSurfaceGates();
  return showAiModels ? <AppsAndAi {...props} /> : <AppsOnly {...props} />;
}
