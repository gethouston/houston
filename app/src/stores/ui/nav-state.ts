import {
  initialNavState,
  type NavEntry,
  type NavMode,
} from "../../lib/nav-stack.ts";
import type { SettingsSectionId } from "../../lib/settings-sections";
import type { TeamSectionId } from "../../lib/teams-model.ts";
import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";

export interface NavFields {
  viewMode: string;
  settingsSection: SettingsSectionId | null;
  activeAgentId: string | null;
  agentSection: TeamSectionId | null;
  agentsHomeAgentId: string | null;
  agentsHomeTeamId: string | null;
  chatAgentId: string | null;
  chatMissionId: string | null;
  navStack: NavEntry[];
  navIndex: number;
}

export interface NavActions {
  navBack: () => void;
  navApplyHistory: (index: number) => void;
  setViewMode: (mode: string, opts?: { nav?: NavMode }) => void;
  openAgentView: (
    agentId: string,
    section: TeamSectionId,
    opts?: {
      nav?: NavMode;
    },
  ) => void;
  setSettingsSection: (section: SettingsSectionId | null) => void;
  openSettings: (
    section: SettingsSectionId | null,
    opts?: {
      nav?: NavMode;
    },
  ) => void;
  openAgentsHome: (
    agentId: string | null,
    opts?: {
      nav?: NavMode;
    },
  ) => void;
  setAgentsHomeTeamId: (teamId: string | null) => void;
  openMissionChat: (
    agentId: string,
    missionId: string | null,
    opts?: { nav?: NavMode },
  ) => void;
  closeMissionChat: () => void;
}

export const navInitialState = {
  viewMode: AGENTS_HOME_VIEW_ID,
  settingsSection: null,
  activeAgentId: null,
  agentSection: null,
  agentsHomeAgentId: null,
  agentsHomeTeamId: null,
  chatAgentId: null,
  chatMissionId: null,
  ...initialNavState(),
} satisfies NavFields;
