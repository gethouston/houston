import {
  Empty,
  EmptyDescription,
  EmptyTitle,
  resolveAgentColor,
  Spinner,
} from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrgUsage } from "../../hooks/queries";
import { useAgentStore } from "../../stores/agents";
import { agentLabel, memberLabel } from "./org-roster";
import { aggregateUsage, usageMax, usageTotal } from "./org-usage-model";
import type { OrgTabProps } from "./organization-view";
import { UsageAgentRow } from "./usage-agent-row";

/**
 * Organization > Usage: last-30-days message volume per agent, with an
 * expandable per-person breakdown. Owner sees the whole org; an admin sees
 * only their managed agents (the gateway filters). Aggregation is the pure
 * {@link aggregateUsage}; the view is a dumb render of tokened bars. Failures
 * surface through the query's `call()` wrapper.
 */
export default function UsageTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const agents = useAgentStore((s) => s.agents);
  const enabled = ctx.role === "owner" || ctx.role === "admin";
  const { data: rows, isLoading, isError } = useOrgUsage(enabled);

  const usage = useMemo(() => aggregateUsage(rows ?? []), [rows]);
  const max = usageMax(usage);
  const total = usageTotal(usage);
  const members = ctx.org.members;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-10 text-sm text-ink-muted">{t("usageTab.error")}</p>
    );
  }

  if (usage.length === 0) {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("usageTab.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("usageTab.empty.body")}</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="mt-2">
      <p className="mb-2 text-sm text-ink-muted">
        {t("usageTab.summary", { count: total })}
      </p>
      <ul className="flex flex-col">
        {usage.map((agent) => {
          const match = agents.find(
            (a) => a.folderPath === agent.agentSlug || a.id === agent.agentSlug,
          );
          return (
            <UsageAgentRow
              key={agent.agentSlug}
              agent={agent}
              name={agentLabel(agent.agentSlug, agents)}
              color={resolveAgentColor(match?.color)}
              max={max}
              memberName={(id) => memberLabel(id, members)}
            />
          );
        })}
      </ul>
    </div>
  );
}
