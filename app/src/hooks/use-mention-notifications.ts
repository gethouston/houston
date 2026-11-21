import type { Capabilities } from "@houston/engine-adapter";
import type { TFunction } from "i18next";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { actingUser } from "../lib/acting-user";
import { latestCachedAllConversations } from "../lib/all-conversations-cache";
import { isSetupChatMode } from "../lib/integration-chat-setup";
import { logger } from "../lib/logger";
import {
  latestMentionFor,
  type RelevanceConversation,
} from "../lib/mission-relevance";
import { resolveNotificationTarget } from "../lib/notification-nav";
import { isMultiplayer } from "../lib/org-roles";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import {
  getReadCursorStore,
  markConversationMentionNotified,
} from "../lib/read-cursor-live-store";
import { cursorKey, notifiedFloorFor } from "../lib/read-cursors";
import { useAgentStore } from "../stores/agents";
import type { UserProfile } from "./queries/use-user-profiles";
import { USER_PROFILES_KEY } from "./queries/use-user-profiles";
import { sendSessionNotification } from "./session-notifications";

interface MentionRow extends RelevanceConversation {
  id: string;
  title: string;
  agent_path: string;
  agent_name: string;
  session_key: string;
  agent?: string;
  contributors?: { user_id: string; name?: string }[];
}

function mentionerName(row: MentionRow, userId: string): string | undefined {
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: [USER_PROFILES_KEY] })) {
    const profiles = query.state.data;
    if (!(profiles instanceof Map)) continue;
    const name = (profiles as ReadonlyMap<string, UserProfile>).get(
      userId,
    )?.name;
    if (name) return name;
  }
  return row.contributors?.find((c) => c.user_id === userId)?.name;
}

function scanForMentions(t: TFunction<readonly ["common"]>): void {
  const capabilities = queryClient.getQueryData<Capabilities>(
    queryKeys.capabilities(),
  );
  if (!isMultiplayer(capabilities)) return;
  const selfId = actingUser()?.userId ?? null;
  if (!selfId) return;

  const rows = latestCachedAllConversations<MentionRow[]>(queryClient) ?? [];
  for (const row of rows) {
    if (isSetupChatMode(row.agent)) continue;
    const latest = latestMentionFor(row, selfId);
    if (!latest) continue;
    const key = cursorKey(row.agent_path, row.id);
    if (latest.at <= notifiedFloorFor(getReadCursorStore(), key)) continue;

    markConversationMentionNotified(row.agent_path, row.id, latest.at);
    const name = latest.mention.by
      ? mentionerName(row, latest.mention.by)
      : undefined;
    const title = name
      ? t("common:notifications.mentioned.title", { name })
      : t("common:notifications.mentioned.titleUnknown");
    const body = t("common:notifications.mentioned.body", {
      mission: row.title,
    });
    const { nav } = resolveNotificationTarget(
      useAgentStore.getState().agents,
      row.agent_path,
      row.session_key,
      row.agent_name,
    );
    sendSessionNotification(title, body, nav).catch((e) => {
      logger.error(`[notification] mention notification failed: ${e}`);
    });
  }
}

export function useMentionNotifications(): void {
  const { t } = useTranslation(["common"]);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      const head = event.query.queryKey[0];
      if (head !== "all-conversations" && head !== "activity") return;
      try {
        scanForMentions(tRef.current);
      } catch (e) {
        logger.error(`[notification] mention scan failed: ${e}`);
      }
    });
  }, []);
}
