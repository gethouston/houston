/**
 * "Take me to agent X's <thing>", performed.
 *
 * The imperative half of {@link agentDestination}: it snapshots the teams from
 * the stores, resolves the destination, and writes it. Store-free callers
 * (a desktop notification click, the @mention row, the command palette) reach
 * for these rather than composing `openTeamView` themselves, so the destination
 * map lives in exactly one place. The RULES are pure and unit-tested in
 * `lib/agent-nav.ts`; this file only binds them to the stores.
 */

import type { Capabilities } from "@houston-ai/engine-client";
import type { AgentSettingsSection } from "../components/agent-settings/agent-settings-nav.ts";
import { useTeamSettingsNav } from "../components/team-view/team-settings-nav-store.ts";
import { getCurrentAgentTeams } from "../hooks/queries/use-agent-teams.ts";
import { getCurrentSidebarLayout } from "../hooks/use-sidebar-layout.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { agentDestination } from "./agent-nav.ts";
import i18n from "./i18n.ts";
import { hasAgentTeams } from "./org-roles.ts";
import { queryClient } from "./query-client.ts";
import { queryKeys } from "./query-keys.ts";
import { resolveTeamsForBackend } from "./teams-backend.ts";
import type { TeamView } from "./teams-model.ts";

/**
 * The teams as they are RIGHT NOW, outside React. Same inputs `useTeams()`
 * composes (the capability, the server's teams, the agents, the cached sidebar
 * layout, the workspace name), read from the stores and the query cache, and
 * branched by the very same `resolveTeamsForBackend` — so a keyboard shortcut
 * or a notification handler can never resolve different teams than the rail.
 */
function currentTeams(): TeamView[] {
  const workspace = useWorkspaceStore.getState().current;
  if (!workspace) return [];
  const capabilities = queryClient.getQueryData<Capabilities>(
    queryKeys.capabilities(),
  );
  return resolveTeamsForBackend({
    agents: useAgentStore.getState().agents,
    layout: getCurrentSidebarLayout(workspace.id),
    serverBacked: hasAgentTeams(capabilities),
    serverTeams: getCurrentAgentTeams(),
    workspaceName: workspace.name,
  });
}

/** Open the board the agent's missions live on, filtered to that agent. */
export function openAgentBoard(agentId: string): void {
  const dest = agentDestination(currentTeams(), agentId, "board");
  const ui = useUIStore.getState();
  if (dest.view === "dashboard") {
    ui.setViewMode("dashboard");
    return;
  }
  ui.openTeamView(dest.teamId, dest.section, {
    agentFilter: dest.agentFilter,
  });
}

/**
 * Open one of the agent's team sections that narrows to it — its routines or
 * the files it keeps.
 *
 * When no team claims the agent yet there is no Routines or Files surface to
 * open: the dashboard is the cross-agent MISSION board and shows neither, so
 * dropping the user there would answer a question they did not ask. Instead we
 * route through the one fallback that IS honest, {@link openAgentBoard} — the
 * board genuinely holds every agent's missions, and it is the same landing spot
 * every other agent nav uses, documented in one place. Sending a Routines
 * request straight to the dashboard was a second, unexplained fallback.
 */
export function openAgentSection(
  agentId: string,
  target: "routines" | "files",
): void {
  const dest = agentDestination(currentTeams(), agentId, target);
  if (dest.view === "dashboard") {
    openAgentBoard(agentId);
    return;
  }
  useUIStore.getState().openTeamView(dest.teamId, dest.section, {
    agentFilter: dest.agentFilter,
  });
}

/**
 * Open the canonical agent settings page for one agent: its team's Settings
 * section, already drilled into that agent (and, when asked, on one section).
 *
 * Callers MUST gate the affordance on `canOpenAgentSettings(capabilities, agent)`
 * first — Team Settings is the page's only door, and the gate is per AGENT (an
 * agent's own manager may reach it without org-wide Team Settings rights). An
 * agent no team claims is an
 * impossible state for an agent that exists, so it is loud rather than silent:
 * there is nowhere honest to send the user, and a no-op click is a bug report
 * we would never receive.
 */
export function openAgentSettings(
  agentId: string,
  section?: AgentSettingsSection,
): void {
  const dest = agentDestination(currentTeams(), agentId, "settings");
  const ui = useUIStore.getState();
  if (dest.view === "dashboard") {
    // Nothing opens, so nothing must stay armed: a one-shot left pending by an
    // EARLIER call would survive this failure and fire the next time the user
    // opened Team Settings by hand, drilling them into an agent they never
    // asked for.
    useTeamSettingsNav.getState().clearRequested();
    ui.addToast({
      title: i18n.t("teams:teamView.settings.navUnavailable"),
      description: i18n.t("teams:teamView.settings.navUnavailableBody"),
      variant: "error",
    });
    return;
  }
  useTeamSettingsNav.getState().requestAgentDetail(agentId, section);
  ui.openTeamView(dest.teamId, dest.section);
}
