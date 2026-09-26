/**
 * "Take me to agent X's <thing>", performed.
 *
 * The imperative half of {@link agentDestination}: it resolves the destination
 * and writes it. Store-free callers
 * (a desktop notification click, the @mention row, the command palette) reach
 * for these rather than composing `openAgentView` themselves, so the destination
 * map lives in exactly one place. The RULES are pure and unit-tested in
 * `lib/agent-nav.ts`; this file only binds them to the stores.
 */

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

/** What runs once the requested destination is on screen. */
export interface OpenAgentOptions {
  /**
   * Publishes a one-shot for the opened surface (the mission to select, the
   * routine chat to reopen). It runs only when the destination opens, so a
   * surface still on screen while the roster settles never consumes it.
   */
  onOpened?: () => void;
}

/**
 * Open the agent's Tasks screen: its board, or on the phone its one task list.
 * An agent the settled roster lacks uses the home destination.
 */
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

/**
 * The employee a nav that names none works on ({@link workingAgentId}), read
 * from the stores.
 */
export function currentWorkingAgentId(): string | null {
  const { current, agents } = useAgentStore.getState();
  const workspaceId = useWorkspaceStore.getState().current?.id;
  return workingAgentId(
    current?.id ?? null,
    agents,
    getCurrentSidebarLayout(workspaceId),
  );
}

/**
 * Open the Tasks screen a compose starts from when the user stands off every
 * board. The Agents home has no New task, so it is the landing only for an
 * empty roster.
 */
export function openComposeBoard(): void {
  const agentId = currentWorkingAgentId();
  if (agentId) openAgentBoard(agentId);
  else openHome();
}

/**
 * Open the agent's Routines or Files section. An agent the settled roster
 * lacks uses the home destination.
 */
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

/**
 * Open the agent settings page, focused on that agent and the requested section.
 *
 * Callers MUST gate the affordance on `canOpenAgentSettings(capabilities, agent)`
 * first. The gate is per agent. An agent the settled roster lacks has no
 * settings anywhere, so this says so instead of landing somewhere unasked.
 */
export function openAgentSettings(
  agentId: string,
  section?: AgentSettingsSection,
): void {
  withSettledAgent(agentId, (exists) => {
    if (!exists) {
      // Nothing opens, so nothing may stay armed: a one-shot left by an
      // earlier call would otherwise drill the next settings visit into an
      // agent the user never asked for.
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
  });
}

/** Write a resolved destination to the nav. */
function openDestination(dest: AgentDestination): void {
  const ui = useUIStore.getState();
  if (dest.kind === "task-list") ui.openAgentsHome(dest.agentId);
  else ui.openAgentView(dest.agentId, dest.section);
}

let cancelWaitingNav: () => void = () => {};

/**
 * Decide on the roster as it settles, never mid-load, where a just-created or
 * not-yet-listed agent would read as missing. The newest request replaces
 * one still waiting, so a burst of clicks lands once; any navigation (a UI
 * store reset included) or space switch while it waits drops it, so the user
 * is never pulled away from where they went since.
 */
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
