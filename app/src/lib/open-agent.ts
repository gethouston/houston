import type { AgentSettingsSection } from "../components/agent-settings/agent-settings-nav.ts";
import { useAgentSettingsNav } from "../components/team-view/agent-settings-nav-store.ts";
import { getCurrentSidebarLayout } from "../hooks/use-sidebar-layout.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import {
  type AgentDestination,
  agentDestination,
  workingAgentId,
} from "./agent-nav.ts";
import { openHome } from "./home-nav.ts";
import i18n from "./i18n.ts";
import { afterRosterSettles, onStoreChange } from "./roster-settled.ts";
import { isMobileViewport } from "./viewport.ts";

export interface OpenAgentOptions {
  onOpened?: () => void;
}

export function openAgentBoard(agentId: string, opts?: OpenAgentOptions): void {
  withSettledAgent(agentId, (exists) => {
    if (!exists) {
      openHome();
      return;
    }
    openDestination(agentDestination(agentId, "board", isMobileViewport()));
    opts?.onOpened?.();
  });
}

export function currentWorkingAgentId(): string | null {
  const { current, agents } = useAgentStore.getState();
  const workspaceId = useWorkspaceStore.getState().current?.id;
  return workingAgentId(
    current?.id ?? null,
    agents,
    getCurrentSidebarLayout(workspaceId),
  );
}

export function openComposeBoard(): void {
  const agentId = currentWorkingAgentId();
  if (agentId) openAgentBoard(agentId);
  else openHome();
}

export function openAgentSection(
  agentId: string,
  target: "routines" | "files",
  opts?: OpenAgentOptions,
): void {
  withSettledAgent(agentId, (exists) => {
    if (!exists) {
      openHome();
      return;
    }
    openDestination(agentDestination(agentId, target, isMobileViewport()));
    opts?.onOpened?.();
  });
}

export function openAgentSettings(
  agentId: string,
  section?: AgentSettingsSection,
  opts?: OpenAgentOptions,
): void {
  withSettledAgent(agentId, (exists) => {
    if (!exists) {
      useAgentSettingsNav.getState().clearRequested();
      useUIStore.getState().addToast({
        title: i18n.t("teams:agentNav.settingsUnavailable"),
        description: i18n.t("teams:agentNav.settingsUnavailableBody"),
        variant: "error",
      });
      return;
    }
    useAgentSettingsNav.getState().requestAgentDetail(agentId, section);
    openDestination(agentDestination(agentId, "settings", isMobileViewport()));
    opts?.onOpened?.();
  });
}

export function openAgentApiAccess(
  agentId: string,
  opts?: OpenAgentOptions,
): void {
  openAgentSettings(agentId, "manage", {
    onOpened: () => {
      useAgentSettingsNav.getState().setApiAccessFor(agentId);
      opts?.onOpened?.();
    },
  });
}

function openDestination(dest: AgentDestination): void {
  const ui = useUIStore.getState();
  if (dest.kind === "task-list") ui.openAgentsHome(dest.agentId);
  else ui.openAgentView(dest.agentId, dest.section);
}

let cancelWaitingNav: () => void = () => {};

function withSettledAgent(
  agentId: string,
  run: (exists: boolean) => void,
): void {
  cancelWaitingNav();
  cancelWaitingNav = afterRosterSettles(
    useAgentStore,
    () =>
      run(
        useAgentStore.getState().agents.some((agent) => agent.id === agentId),
      ),
    [
      onStoreChange(useUIStore, (s) => s.navStack),
      onStoreChange(useUIStore, (s) => s.navIndex),
      onStoreChange(useWorkspaceStore, (s) => s.current?.id),
    ],
  );
}
