import type { SlackCompletion } from "../../lib/settings-landing.ts";
import type { UISliceCreator } from "./state.ts";

export interface SessionFields {
  claudeAvailable: boolean | null;
  authRequired: string | null;
  pendingRoutineChat: { agentId: string; activityId: string } | null;
  pendingSkillChatActivityId: string | null;
  integrationSetupChatAgentId: string | null;
  customIntegrationsAgentId: string | null;
  activeLessonId: string | null;
  pendingSlackCompletion: SlackCompletion | null;
  pendingLinkedInCompletion: SlackCompletion | null;
}

export interface SessionActions {
  setClaudeAvailable: (available: boolean | null) => void;
  setAuthRequired: (provider: string | null) => void;
  setPendingRoutineChat: (
    target: { agentId: string; activityId: string } | null,
  ) => void;
  setPendingSkillChatActivityId: (activityId: string | null) => void;
  setIntegrationSetupChatAgentId: (agentId: string | null) => void;
  setCustomIntegrationsAgentId: (agentId: string | null) => void;
  setActiveLessonId: (lessonId: string | null) => void;
  setPendingSlackCompletion: (completion: SlackCompletion | null) => void;
  setPendingLinkedInCompletion: (completion: SlackCompletion | null) => void;
}

export const sessionInitialState = {
  claudeAvailable: null,
  authRequired: null,
  pendingRoutineChat: null,
  pendingSkillChatActivityId: null,
  integrationSetupChatAgentId: null,
  customIntegrationsAgentId: null,
  activeLessonId: null,
  pendingSlackCompletion: null,
  pendingLinkedInCompletion: null,
} satisfies SessionFields;

export const createSessionActions: UISliceCreator<SessionActions> = (set) => ({
  setClaudeAvailable: (claudeAvailable) => set({ claudeAvailable }),
  setAuthRequired: (authRequired) => set({ authRequired }),
  setPendingRoutineChat: (pendingRoutineChat) => set({ pendingRoutineChat }),
  setPendingSkillChatActivityId: (pendingSkillChatActivityId) =>
    set({ pendingSkillChatActivityId }),
  setIntegrationSetupChatAgentId: (integrationSetupChatAgentId) =>
    set({ integrationSetupChatAgentId }),
  setCustomIntegrationsAgentId: (customIntegrationsAgentId) =>
    set({ customIntegrationsAgentId }),
  setActiveLessonId: (activeLessonId) => set({ activeLessonId }),
  setPendingSlackCompletion: (pendingSlackCompletion) =>
    set({ pendingSlackCompletion }),
  setPendingLinkedInCompletion: (pendingLinkedInCompletion) =>
    set({ pendingLinkedInCompletion }),
});
