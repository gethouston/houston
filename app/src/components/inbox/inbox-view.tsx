import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { useAgentStore } from "../../stores/agents";
import { openMentionRow } from "../board/mention-row-nav";
import type { MentionInboxRow } from "../board/mentions-inbox-model";
import {
  MentionsInboxRow,
  MentionsInboxRowSkeleton,
} from "../board/mentions-inbox-row";
import {
  mentionerIds,
  resolveMentionerName,
  storedContributorNames,
} from "../board/mentions-inbox-view-model";
import { useMentionInbox } from "../board/use-mention-inbox";
import { PageContainer, PageHero } from "../shell/page-shell";

/**
 * The Inbox: every mission where a teammate typed my name, newest first. A
 * top-level screen of its own, so it reads the roster from the store rather
 * than taking it as a prop.
 *
 * It is a TOP-LEVEL row for everyone, deliberately NOT capability-gated: it is
 * the app's landing surface whenever no team has resolved yet, so it has to
 * exist before anything else does. Single player simply lands on its empty
 * state, which is the honest answer when nobody can mention you.
 *
 * Deliberately NOT a board, and so it wears no board chrome: there is no
 * surface to go back to, no mode to pill and nothing to search, only "who
 * pinged me, where, and how long ago". It is the canonical page chrome over a
 * plain scrollable list of plane rows, each of which navigates to the mission's
 * chat the same way a completion notification does.
 *
 * It carries NO Context door any more. What every agent knows about you is a
 * rail row of its own now ("About me"), and what they know about the company
 * lives in Admin: a quiet button in this masthead asked the user to find a door
 * and then pick a tab before reaching either, which is one level of hide too
 * many for the standing knowledge agents read before they act.
 */
export function InboxView() {
  const { t, i18n } = useTranslation("dashboard");
  const agents = useAgentStore((s) => s.agents);
  const { rows, conversations, isPending } = useMentionInbox(agents);

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
    <div className="flex h-full flex-col">
      {/* The masthead is fixed and the list scrolls under it, so a long backlog
          never pushes the screen's title off the top. `page-shell` sanctions
          the split: the top container opens the page, the scrolling one closes
          it. `px-3` matches the rows' own inset so the title sits on the same
          left edge they do. */}
      <PageContainer className="shrink-0 pt-10">
        <PageHero
          title={t("inbox.title")}
          subtitle={t("inbox.subtitle")}
          className="mb-6 px-3"
        />
      </PageContainer>
      <PageContainer className="min-h-0 flex-1 overflow-y-auto pb-10">
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
      </PageContainer>
    </div>
  );
}
