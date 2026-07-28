/**
 * The header bell: every mention of the viewer, one click from its mission.
 * Replaces the old header Share button (sharing stayed reachable from Agent
 * Settings and the Permissions People tab) because the header slot is for the
 * thing a collaborator reaches for constantly, and that is "where am I
 * needed", not "change who has access".
 *
 * Multiplayer-gated like every mention surface: single player renders nothing.
 * The list reuses the Mission Control inbox's rows, models and navigation
 * verbatim, so the bell and the inbox can never disagree about what a mention
 * is, what it is called, or where clicking it lands.
 */

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { Bell } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isMultiplayer } from "../../lib/org-roles";
import { useAgentStore } from "../../stores/agents";
import { openMentionRow } from "../board/mention-row-nav";
import { useMentionInbox } from "../board/mentions-inbox";
import type { MentionInboxRow } from "../board/mentions-inbox-model";
import { MentionsInboxRow } from "../board/mentions-inbox-row";
import {
  mentionCountLabel,
  mentionerIds,
  resolveMentionerName,
  storedContributorNames,
} from "../board/mentions-inbox-view-model";

export function NotificationsBell({ collapsed }: { collapsed?: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const { capabilities } = useCapabilities();
  const agents = useAgentStore((s) => s.agents);
  const [open, setOpen] = useState(false);

  const multiplayer = isMultiplayer(capabilities);
  const { rows, conversations, mentionCount } = useMentionInbox(
    multiplayer ? agents : [],
  );
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
    (row: MentionInboxRow) => {
      setOpen(false);
      openMentionRow(agents, conversations, row);
    },
    [agents, conversations],
  );

  if (!multiplayer) return null;

  const label = t("mentions.bell.label");
  // The button's accessible name carries the unread count; the visual badge is
  // decorative for AT (a span may not hold aria-label of its own).
  const accessibleLabel =
    mentionCount > 0
      ? `${label}, ${t("mentions.ariaCount", { count: mentionCount })}`
      : label;
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={accessibleLabel}
              className="relative rounded-full"
              size={collapsed ? "icon" : "default"}
              variant="ghost"
            >
              <Bell className="size-5" />
              {collapsed ? null : label}
              {mentionCount > 0 && (
                <span
                  aria-hidden
                  className="-right-0.5 -top-0.5 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 font-semibold text-[10px] text-action-text tabular-nums"
                >
                  {mentionCountLabel(mentionCount)}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-96 p-1">
        {rows.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>{t("mentions.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("mentions.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {rows.map((row) => (
              <li key={`${row.agentPath}:${row.conversationId}`}>
                <MentionsInboxRow
                  avatarLabel={row.byUserId ? nameFor(row.byUserId) : ""}
                  avatarUrl={
                    (row.byUserId
                      ? profiles.get(row.byUserId)?.avatarUrl
                      : null) ?? undefined
                  }
                  labels={{
                    by: row.byUserId
                      ? t("mentions.row.by", { name: nameFor(row.byUserId) })
                      : t("mentions.row.byUnknown"),
                    agent: t("mentions.row.agent", { agent: row.agentName }),
                  }}
                  locale={i18n.language}
                  onOpen={openRow}
                  row={row}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
