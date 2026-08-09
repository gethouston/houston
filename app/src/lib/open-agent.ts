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

import type { AgentSettingsSection } from "../components/agent-settings/agent-settings-nav.ts";
import { useTeamSettingsNav } from "../components/team-view/team-settings-nav-store.ts";
import { useUIStore } from "../stores/ui.ts";
import { agentDestination } from "./agent-nav.ts";
import { currentTeams } from "./current-teams.ts";
import { openHome } from "./home-nav.ts";
import i18n from "./i18n.ts";

/**
 * Open the board the agent's missions live on, filtered to that agent.
 *
 * With no team claiming the agent there is no board of its own to open, so this
 * goes HOME — the first team's Mission Control, or the Inbox when no team has
 * resolved. That is the one fallback the whole app shares (`lib/home-nav.ts`),
 * which is what keeps a nav that misses from landing somewhere bespoke.
 */
export function openAgentBoard(agentId: string): void {
  const dest = agentDestination(currentTeams(), agentId, "board");
  if (dest.view === "none") {
    openHome();
    return;
  }
  useUIStore.getState().openTeamView(dest.teamId, dest.section, {
    agentFilter: dest.agentFilter,
  });
}

/**
 * Open one of the agent's team sections that narrows to it — its routines or
 * the files it keeps.
 *
 * When no team claims the agent there is no Routines or Files surface to open.
 * Rather than invent a second fallback, the request routes through
 * {@link openAgentBoard}, which lands on the one home every other nav lands on.
 * The chain is deliberate: one fallback rule, named once, reachable from here.
 */
export function openAgentSection(
  agentId: string,
  target: "routines" | "files",
): void {
  const dest = agentDestination(currentTeams(), agentId, target);
  if (dest.view === "none") {
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
 * agent no team claims is an impossible state for an agent that exists, so it
 * is loud rather than silent: unlike a board request there is nowhere honest to
 * send the user (some other team's Settings lists some other team's agents),
 * and a no-op click is a bug report we would never receive.
 */
export function openAgentSettings(
  agentId: string,
  section?: AgentSettingsSection,
): void {
  const dest = agentDestination(currentTeams(), agentId, "settings");
  const ui = useUIStore.getState();
  if (dest.view === "none") {
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
