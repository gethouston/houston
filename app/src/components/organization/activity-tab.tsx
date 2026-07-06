import {
  Button,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrgAudit } from "../../hooks/queries";
import { humanizeSkillName } from "../../lib/humanize-skill-name";
import { useAgentStore } from "../../stores/agents";
import { type AuditResolvers, formatAuditEntry } from "./org-activity-format";
import { agentLabel, memberLabel } from "./org-roster";
import { formatRelativeTime } from "./org-time";
import type { OrgTabProps } from "./organization-view";

function roleKey(role: string): "owner" | "admin" | "user" {
  return role === "owner" || role === "admin" ? role : "user";
}

/**
 * Organization > Activity: a plain-language feed of the org audit log. Each
 * entry is mapped to a sentence by the pure {@link formatAuditEntry}; ids and
 * slugs resolve to member emails + agent names against the loaded roster and
 * agent list. Newest first, "Show more" pages backwards via the before-cursor.
 * Owner sees the whole org; an admin sees only their managed agents (the
 * gateway filters). Failures surface through the query's `call()` wrapper.
 */
export default function ActivityTab({ ctx }: OrgTabProps) {
  const { t, i18n } = useTranslation("teams");
  const agents = useAgentStore((s) => s.agents);
  const enabled = ctx.role === "owner" || ctx.role === "admin";
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useOrgAudit(enabled);

  const entries = useMemo(() => data?.pages.flat() ?? [], [data]);
  const members = ctx.org.members;

  const resolversFor = (
    actorId: string,
    agentSlug?: string,
  ): AuditResolvers => ({
    actor: memberLabel(actorId, members),
    agent: agentLabel(agentSlug, agents),
    member: (id) => memberLabel(id, members),
    role: (r) => t(`activityTab.roles.${roleKey(r)}`),
    apps: (tks) => tks.map(humanizeSkillName).join(", "),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        {t("activityTab.error")}
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("activityTab.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("activityTab.empty.body")}</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="mt-2">
      <ul className="flex flex-col">
        {entries.map((entry) => {
          const { action, vars } = formatAuditEntry(
            entry,
            resolversFor(entry.actor, entry.agentSlug),
          );
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 border-b border-border/40 py-3 last:border-0"
            >
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  {t(`activityTab.actions.${action}`, vars)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(entry.createdAt, i18n.language)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            className="rounded-full"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage
              ? t("activityTab.loading")
              : t("activityTab.showMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
