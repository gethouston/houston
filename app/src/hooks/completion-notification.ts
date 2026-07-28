import type { TFunction } from "i18next";
import { actingUser } from "../lib/acting-user";
import {
  completionInteractionReady,
  interactionNotificationBodyKey,
  interactionQuestionCount,
} from "../lib/active-interaction";
import { latestCachedAllConversations } from "../lib/all-conversations-cache";
import { logger } from "../lib/logger";
import {
  type NotificationNav,
  resolveNotificationTarget,
} from "../lib/notification-nav";
import {
  type SessionConversationRow,
  shouldNotifyCompletion,
} from "../lib/notification-relevance";
import { queryClient } from "../lib/query-client";
import type { Agent } from "../lib/types";
import type { CompletionLatches } from "./completion-latches";
import { sendSessionNotification } from "./session-notifications";
import {
  getConversationBoardStatus,
  getConversationInteraction,
} from "./use-conversation-vm";

/**
 * Everything the completion notification needs from the shell, passed in rather
 * than read from stores here, so this module stays a plain function over data.
 */
export interface CompletionNotificationContext {
  agents: Agent[];
  workspaceName: string;
  /** Name to fall back to when the finished agent is not in the loaded list. */
  fallbackAgentName: string;
  /** Read at FIRE time, so the copy follows a language change mid-turn. */
  t: () => TFunction<["common"]>;
}

/** The translated body for the interaction the turn settled on. */
function completionBody(
  t: TFunction<["common"]>,
  agentPath: string,
  sessionKey: string,
): string {
  const interaction = getConversationInteraction(agentPath, sessionKey) ?? null;
  switch (interactionNotificationBodyKey(interaction)) {
    case "sessionComplete.question":
      return t("common:notifications.sessionComplete.question", {
        count: interactionQuestionCount(interaction),
      });
    case "sessionComplete.signin":
      return t("common:notifications.sessionComplete.signin");
    case "sessionComplete.connect":
      return t("common:notifications.sessionComplete.connect");
    case "sessionComplete.credential":
      return t("common:notifications.sessionComplete.credential");
    default:
      return t("common:notifications.sessionComplete.body");
  }
}

/**
 * Should this completed session interrupt the signed-in user? (HOU-945)
 *
 * In a team many agents run in parallel, so "a mission finished" is only news
 * when the mission is MINE or @mentions me; otherwise the ping trains the user
 * to dismiss every ping, including the ones that matter. The rule itself lives
 * in `lib/notification-relevance.ts` (pure, unit-tested) and fails OPEN: an
 * unattributed mission, a mission the roster cache has not described yet, and a
 * signed-out user all notify, so desktop and single-player behaviour stay
 * byte-identical to before this gate existed.
 *
 * `selfId` is read HERE rather than when the latch was armed: a latch can
 * outlive a sign-in or sign-out by its grace window, and the person worth
 * interrupting is whoever is signed in when the notification actually fires.
 */
function isRelevantCompletion(agentPath: string, sessionKey: string): boolean {
  return shouldNotifyCompletion({
    rows: latestCachedAllConversations<SessionConversationRow[]>(queryClient),
    agentPath,
    sessionKey,
    selfId: actingUser()?.userId ?? null,
  });
}

/**
 * Arm the OS notification for a session that just completed.
 *
 * The body depends on the interaction the turn settled on, which
 * `persistBoardStatus` folds into the conversation VM AFTER the `SessionStatus`
 * event but BEFORE the settle's `ActivityChanged` echo. So the notification is
 * LATCHED here and sent on that echo: `ready` gates the fire on the fold having
 * landed, and the send reads the settled body (see `completion-latches.ts`).
 *
 * The nav target is resolved now, against the agent that FINISHED (matched by
 * folder path) rather than the one currently open, so clicking the notification
 * jumps to it even after the user switched agents or closed the chat.
 */
export function latchCompletionNotification(
  latches: CompletionLatches,
  agentPath: string,
  sessionKey: string,
  ctx: CompletionNotificationContext,
): void {
  const { agentName, nav } = resolveNotificationTarget(
    ctx.agents,
    agentPath,
    sessionKey,
    ctx.fallbackAgentName,
  );
  warnIfUnnavigable(nav, agentPath, sessionKey);

  const title = ctx.t()("common:notifications.sessionComplete.title", {
    workspace: ctx.workspaceName,
    agent: agentName,
  });

  latches.latch(
    agentPath,
    sessionKey,
    () =>
      completionInteractionReady(
        getConversationBoardStatus(agentPath, sessionKey),
      ),
    () => {
      const body = completionBody(ctx.t(), agentPath, sessionKey);
      if (!isRelevantCompletion(agentPath, sessionKey)) {
        logger.debug(
          `[notification] completion suppressed, mission not relevant to the signed-in user: agent_path=${agentPath} session_key=${sessionKey}`,
        );
        return;
      }
      sendSessionNotification(title, body, nav);
    },
  );
}

/** A chat that should have been navigable but isn't is a real (silent) defect,
 *  so it leaves a breadcrumb instead of failing quietly. */
function warnIfUnnavigable(
  nav: NotificationNav | undefined,
  agentPath: string,
  sessionKey: string,
): void {
  if (nav) return;
  if (!sessionKey.startsWith("activity-") && !sessionKey.startsWith("routine-"))
    return;
  logger.debug(
    `[notification] completed chat not navigable (agent not in loaded list?): agent_path=${agentPath} session_key=${sessionKey}`,
  );
}
