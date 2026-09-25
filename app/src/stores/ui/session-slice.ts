import type { SlackCompletion } from "../../lib/settings-landing.ts";
import type { UISliceCreator } from "./state.ts";

/** Session status flags and the one-shot targets surfaces consume once. */
export interface SessionFields {
  claudeAvailable: boolean | null;
  /** Provider ID that needs re-auth (e.g. "anthropic", "openai"), or null if OK */
  authRequired: string | null;
  /**
   * One-shot nav target for a routine chat with no board card (session-
   * finished notification click, #401): the OWNING agent plus the activity id
   * to open in that team's Routines section. The owner travels with it because
   * that section is cross-agent: without it the surface would have to guess
   * whose chat the id belongs to, and guess wrong the moment two agents are in
   * view. The section mounts the owner's chat host, which resolves the id to a
   * routine or a draft and clears the request.
   */
  pendingRoutineChat: { agentId: string; activityId: string } | null;
  /**
   * One-shot nav target for a skill-setup chat with no board card (session-
   * finished notification click, HOU-791): the activity id to open in the
   * Skills section. The surface consumes it (resolves which skill or draft it
   * belongs to, opens the chat, clears it) the moment it sees a match.
   */
  pendingSkillChatActivityId: string | null;
  /** Agent id whose custom-integration setup chat (Integrations page) is
   *  open, or null. The draft itself is derived from that agent's activities;
   *  the page has no per-chat route, so an explicit flag marks the open one. */
  integrationSetupChatAgentId: string | null;
  /** On a per-agent custom-integration deployment (PRODUCT-1773), the agent
   *  whose custom list the global Integrations page shows; null = not picked
   *  yet (the setup chat's agent, else the first agent, stands in). */
  customIntegrationsAgentId: string | null;
  /** The Academy lesson playing over the workspace shell
   * (`components/academy/lessons`), or null. Armed by the Academy path, cleared
   * by finishing or exiting the lesson. Ephemeral, never persisted: a lesson is a live run over
   * the app, and a reload must land the user back in the app rather than into a
   * beat whose world is long gone. */
  activeLessonId: string | null;
  /** The one-time Slack completion a public callback landed with
   * (`?settings=channels&slack=…`), queued for the Channels section, which
   * redeems it once and clears it. Ephemeral, never persisted and never logged:
   * a reload must not retry a ticket, and the ticket is a bearer secret. */
  pendingSlackCompletion: SlackCompletion | null;
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
});
