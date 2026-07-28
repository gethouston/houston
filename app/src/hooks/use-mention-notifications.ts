import type { Capabilities } from "@houston-ai/engine-client";
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

/**
 * OS notifications for @mentions (HOU-945): when a teammate types your name in
 * a mission, you hear about it even if Houston is in the background and the
 * mission is not yours.
 *
 * There is no push channel for mentions, and adding one would mean a new
 * subscription per user. Instead this rides the conversation lists the shell
 * ALREADY sweeps: a raw `QueryCache.subscribe` (no query observer, so it can
 * never trigger a fetch or wake a pod) watches the `all-conversations`
 * aggregate and the per-agent `activity` lists, and re-scans the cached rows for
 * a mention newer than the watermark this user has already been pinged about.
 *
 * The watermark ({@link markConversationMentionNotified}) is bumped BEFORE the
 * notification is sent and persists to disk, so one mention aggregate pings
 * exactly once — across re-renders, across a re-scan triggered a millisecond
 * later by a sibling list, and across app restarts.
 */

/** The cached conversation row this hook reads. */
interface MentionRow extends RelevanceConversation {
  id: string;
  title: string;
  agent_path: string;
  agent_name: string;
  session_key: string;
  /** Agent-mode id; guided setup chats are never a mention surface. */
  agent?: string;
  contributors?: { user_id: string; name?: string }[];
}

/**
 * The mentioner's display name from state we ALREADY have: any cached
 * `user-profiles` entry, else the name the row's own contributor stamp carries.
 * A notification path must never fire a fetch, so an unresolved id simply falls
 * back to the generic title.
 */
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

/**
 * Notify for every mention of me that is newer than my watermark. Multiplayer
 * and signed-in only: single-player has no teammates to be mentioned by, so on
 * desktop this whole path is inert.
 */
function scanForMentions(t: TFunction<readonly ["common"]>): void {
  const capabilities = queryClient.getQueryData<Capabilities>(
    queryKeys.capabilities(),
  );
  if (!isMultiplayer(capabilities)) return;
  const selfId = actingUser()?.userId ?? null;
  if (!selfId) return;

  const rows = latestCachedAllConversations<MentionRow[]>(queryClient) ?? [];
  for (const row of rows) {
    // Guided setup chats are excluded everywhere else in this feature (they
    // have no board card, so a ping would open nothing); keep them out here.
    if (isSetupChatMode(row.agent)) continue;
    const latest = latestMentionFor(row, selfId);
    if (!latest) continue;
    const key = cursorKey(row.agent_path, row.id);
    if (latest.at <= notifiedFloorFor(getReadCursorStore(), key)) continue;

    // Bump first: a sibling list landing in the cache re-enters this scan
    // synchronously, and the watermark is what makes that a no-op.
    markConversationMentionNotified(row.agent_path, row.id, latest.at);
    // Mentioning yourself is not news, and this path never sees one:
    // `latestMentionFor` drops self-authored entries at the source, so the
    // ping, the inbox row and the unread badge all agree about it.
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

/**
 * Mount once, at the top of the app, beside `useSessionEvents()`. Watches the
 * conversation caches and pings on every new @mention of the signed-in user.
 */
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
        // Log-only, the documented exception: a passive cache observer has no
        // UI thread to toast on, and throwing here would break the cache's
        // notification loop for every other subscriber in the app.
        logger.error(`[notification] mention scan failed: ${e}`);
      }
    });
  }, []);
}
