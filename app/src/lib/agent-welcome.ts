/**
 * The new agent's welcome mission (HOU-713): right after creation, Houston
 * creates a "Meet {name}" mission, opens its chat, and after a short
 * "in progress" beat the agent greets the user with a hardcoded, localized
 * message — no model turn, so it appears within seconds even while the
 * agent's engine is still cold-starting.
 *
 * The greeting is DERIVED, not persisted: the mission's row carries a
 * `welcome-` session key (the persistent marker, same pattern as routines'
 * `routine-` keys), and the chat renderer prepends the greeting to any
 * conversation under that key (`hooks/use-welcome-greeting.ts` +
 * `use-agent-chat-panel`'s mapFeedItems). Reloads and other devices see it
 * for free.
 *
 * Card status tells the story: created `running` (the standard in-progress
 * indicator narrates the beat), settled to `needs_you` when the greeting
 * reveals — the mission now waits on the user.
 */

import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { useUIStore } from "../stores/ui";
import { getEngine } from "./engine";
import { reportError, showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";
import { tauriActivity } from "./tauri";

export const WELCOME_SESSION_PREFIX = "welcome-";

/** The "agent is getting ready" beat between opening the chat and the
 *  greeting appearing. Long enough to read as the agent arriving, short
 *  enough to never feel stuck. */
export const WELCOME_GREETING_DELAY_MS = 2_500;

export function isWelcomeSessionKey(
  sessionKey: string | null | undefined,
): boolean {
  return Boolean(sessionKey?.startsWith(WELCOME_SESSION_PREFIX));
}

/** Welcome chats created THIS app run → when their greeting reveals. A
 *  welcome chat reopened later (no entry) reveals instantly. */
const revealAtBySession = new Map<string, number>();

export function welcomeGreetingRevealAt(
  sessionKey: string,
): number | undefined {
  return revealAtBySession.get(sessionKey);
}

export async function startAgentWelcomeMission(
  agent: { id: string; name: string; folderPath: string },
  opts: { provider?: string; model?: string } = {},
): Promise<void> {
  const conversationId = crypto.randomUUID();
  const sessionKey = `${WELCOME_SESSION_PREFIX}${conversationId}`;
  revealAtBySession.set(sessionKey, Date.now() + WELCOME_GREETING_DELAY_MS);
  const row = {
    id: conversationId,
    title: i18n.t("shell:agentWelcome.missionTitle", { name: agent.name }),
    description: i18n.t("shell:agentWelcome.missionDescription"),
    provider: opts.provider,
    model: opts.model,
  };
  // Hosted profile: the engine is still warming up, so the row rides the
  // warming queue as a row-only entry (a wire write now would be a held
  // request that dies with a reload) and the board overlays it immediately.
  const queued = useAgentProvisioningStore
    .getState()
    .queueWarmingSend(agent.id, {
      agentPath: agent.folderPath,
      sessionKey,
      text: "",
      rowOnly: true,
      row: { ...row, status: "running" },
    });
  let openId: string = conversationId;
  if (!queued) {
    try {
      const created = await tauriActivity.createWithId(agent.folderPath, row);
      openId = created.id;
      // The welcome chat lives under its own `welcome-` key — the persistent
      // marker the greeting renderer keys on. NewActivity can't carry it, so
      // stamp it (same move as the flush's version-skew stamp).
      await getEngine().updateActivity(agent.folderPath, created.id, {
        session_key: sessionKey,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.activity(agent.folderPath),
      });
    } catch (e) {
      showErrorToast("agent_welcome", "welcome mission create failed", e, {
        userMessage: i18n.t("shell:agentWelcome.failed"),
      });
      return;
    }
  }
  // Open the conversation; the greeting reveals after the beat.
  useUIStore.getState().setActivityPanelId(openId, { forceOpen: true });
  setTimeout(() => {
    void settleWelcome(agent, openId);
  }, WELCOME_GREETING_DELAY_MS);
}

/** The greeting just revealed: the mission stops being "in progress" and
 *  waits on the user. While the engine still warms up the flip lands on the
 *  queued row (the flush carries it to the server); otherwise patch the row
 *  directly. */
async function settleWelcome(
  agent: { id: string; folderPath: string },
  activityId: string,
): Promise<void> {
  const flipped = useAgentProvisioningStore
    .getState()
    .setQueuedRowStatus(agent.id, activityId, "needs_you");
  if (flipped) return;
  try {
    await getEngine().updateActivity(agent.folderPath, activityId, {
      status: "needs_you",
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.activity(agent.folderPath),
    });
  } catch (e) {
    // Cosmetic status write with no user action behind it — breadcrumb only;
    // an unreachable engine surfaces through the user's own next request.
    reportError("agent_welcome", "settling the welcome card failed", e);
  }
}
