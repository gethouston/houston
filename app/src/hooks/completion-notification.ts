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

export interface CompletionNotificationContext {
  agents: Agent[];
  workspaceName: string;
  fallbackAgentName: string;
  t: () => TFunction<["common"]>;
  stopReason?: "turn_time_limit" | "turn_time_limit_unsaved";
}

function completionBody(
  t: TFunction<["common"]>,
  agentPath: string,
  sessionKey: string,
  stopReason?: "turn_time_limit" | "turn_time_limit_unsaved",
): string {
  if (stopReason) return t("common:notifications.sessionComplete.timeLimit");
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

function isRelevantCompletion(agentPath: string, sessionKey: string): boolean {
  return shouldNotifyCompletion({
    rows: latestCachedAllConversations<SessionConversationRow[]>(queryClient),
    agentPath,
    sessionKey,
    selfId: actingUser()?.userId ?? null,
  });
}

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
      const body = completionBody(
        ctx.t(),
        agentPath,
        sessionKey,
        ctx.stopReason,
      );
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
