import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { useReadCursorStore } from "../../hooks/use-read-cursors";
import { useSession } from "../../hooks/use-session";
import type { Agent } from "../../lib/types";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { openMentionRow } from "./mention-row-nav";
import {
  buildMentionInbox,
  type MentionInboxConversation,
  type MentionInboxRow,
} from "./mentions-inbox-model";
import {
  MentionsInboxRow,
  MentionsInboxRowSkeleton,
} from "./mentions-inbox-row";
import {
  mentionerIds,
  resolveMentionerName,
  storedContributorNames,
} from "./mentions-inbox-view-model";

/**
 * Everything the inbox rows AND the toolbar's Mentions pill read, in one hook,
 * so the number on the pill and the rows behind it are derived from one list.
 * Both consumers share the one `useAllConversations` query, so mounting this
 * twice costs no extra fetch.
 *
 * The pill counts `mentionOutstanding`, NOT the broader row `unread` flag: the
 * pill says "N unread mentions" out loud, so counting a mission that merely
 * moved would announce teammates typing my name when nobody did. The rows keep
 * their broader dot, which claims only "something new here" (see
 * `mentions-inbox-model.ts` for the two claims). Nothing renders the row-level
 * unread total today, so the hook does not compute one.
 */
export function useMentionInbox(agents: Agent[]) {
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const cursors = useReadCursorStore();
  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data, isPending } = useAllConversations(paths);
  const conversations: MentionInboxConversation[] = useMemo(
    () => data ?? [],
    [data],
  );
  const rows = useMemo(
    () => buildMentionInbox(conversations, cursors, selfId),
    [conversations, cursors, selfId],
  );
  const mentionCount = useMemo(
    () => rows.reduce((n, row) => n + (row.mentionOutstanding ? 1 : 0), 0),
    [rows],
  );
  return { rows, conversations, mentionCount, isPending };
}

/**
 * Mission Control's Mentions inbox: every mission where a teammate typed my
 * name, newest first. A multiplayer-only surface — `Dashboard` never routes
 * here without the capability, so single player gains no chrome at all.
 *
 * Deliberately NOT a board: there are no columns to move a mention between and
 * no status to read off it, only "who pinged me, where, and how long ago". So
 * it is a plain scrollable list of plane rows, each of which navigates to the
 * mission's chat the same way a completion notification does.
 */
export function MentionsInbox({
  agents,
  onShowActive,
}: {
  agents: Agent[];
  onShowActive: () => void;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const { rows, conversations, mentionCount, isPending } =
    useMentionInbox(agents);

  const senderIds = useMemo(() => mentionerIds(rows), [rows]);
  const { profiles } = useUserProfiles(senderIds);
  const fallbackNames = useMemo(
    () => storedContributorNames(conversations),
    [conversations],
  );
  const nameFor = useCallback(
    (userId: string) => resolveMentionerName(userId, profiles, fallbackNames),
    [profiles, fallbackNames],
  );

  const openRow = useCallback(
    (row: MentionInboxRow) => openMentionRow(agents, conversations, row),
    [agents, conversations],
  );

  return (
    <>
      <MissionControlToolbar
        agents={agents}
        collapsed={false}
        mentionsActive
        onToggleMentions={onShowActive}
        mentionCount={mentionCount}
        onBack={onShowActive}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {isPending ? (
          <div aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <MentionsInboxRowSkeleton key={i} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("mentions.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("mentions.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={`${row.agentPath}:${row.conversationId}`}>
                <MentionsInboxRow
                  row={row}
                  labels={{
                    by: row.byUserId
                      ? t("mentions.row.by", { name: nameFor(row.byUserId) })
                      : t("mentions.row.byUnknown"),
                    agent: t("mentions.row.agent", { agent: row.agentName }),
                  }}
                  avatarLabel={row.byUserId ? nameFor(row.byUserId) : ""}
                  avatarUrl={
                    (row.byUserId
                      ? profiles.get(row.byUserId)?.avatarUrl
                      : null) ?? undefined
                  }
                  locale={i18n.language}
                  onOpen={openRow}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
