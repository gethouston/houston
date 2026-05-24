import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  KanbanBoard,
  type KanbanItem,
  type KanbanColumnConfig,
} from "@houston-ai/board";
import type { TrackerIssue } from "@houston-ai/engine-client";

/**
 * Kanban view of mirrored Linear issues — groups by Linear's
 * `WorkflowStateType` into three columns. Pure presentational
 * component; the parent ([`LinearView`](./linear-view.tsx)) owns
 * loading / empty / not-connected states + the open-in-Linear
 * navigation.
 *
 * Column model is intentionally coarse for V1 (To do / In progress /
 * Done). Linear's typed state categories (triage / backlog / unstarted
 * / started / completed / canceled) fold into the three buckets so
 * users see the kanban as familiar; per-team workflow customisation
 * is a follow-up that requires Linear's `WorkflowState` list (not
 * mirrored in V1).
 */
export interface LinearKanbanProps {
  issues: TrackerIssue[];
  onSelect: (issue: TrackerIssue) => void;
  emptyState?: React.ReactNode;
}

export function LinearKanban({
  issues,
  onSelect,
  emptyState,
}: LinearKanbanProps) {
  const { t } = useTranslation(["tracker"]);

  const columns: KanbanColumnConfig[] = useMemo(
    () => [
      {
        id: "todo",
        label: t("linear.kanban.columns.todo"),
        statuses: ["triage", "backlog", "unstarted"],
      },
      {
        id: "in_progress",
        label: t("linear.kanban.columns.inProgress"),
        statuses: ["started"],
      },
      {
        id: "done",
        label: t("linear.kanban.columns.done"),
        statuses: ["completed", "canceled"],
      },
    ],
    [t],
  );

  const items: KanbanItem[] = useMemo(
    () =>
      issues.map((issue) => ({
        id: issue.providerId,
        title: issue.title,
        description: issue.description ?? undefined,
        // Linear's per-team identifier (e.g. "ENG-42") shown above the
        // title — matches the convention every Linear user already
        // recognises and makes cards scannable at a glance.
        group: issue.identifier,
        // The human-readable Linear state (e.g. "In Review") as a tag.
        // Different teams have different state vocabularies inside the
        // same `state_type` bucket; the tag preserves the specificity
        // the column grouping loses.
        tags: [issue.state],
        // Drives column routing — falls back to `unstarted` for
        // providers that don't expose typed state categories (today
        // only Linear does, but the field is provider-optional in
        // `TrackerIssue`).
        status: issue.stateType ?? "unstarted",
        updatedAt: issue.updatedAt,
        // Stash the URL so the onSelect dispatcher in LinearView can
        // open it without re-querying.
        metadata: { url: issue.url },
      })),
    [issues],
  );

  const idToIssue = useMemo(() => {
    const m = new Map<string, TrackerIssue>();
    for (const issue of issues) {
      m.set(issue.providerId, issue);
    }
    return m;
  }, [issues]);

  return (
    <KanbanBoard
      columns={columns}
      items={items}
      onSelect={(item) => {
        const issue = idToIssue.get(item.id);
        if (issue) {
          onSelect(issue);
        }
      }}
      emptyState={emptyState}
    />
  );
}
