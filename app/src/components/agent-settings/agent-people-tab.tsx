import type { OrgMember } from "@houston/engine-adapter";
import {
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { useSession } from "../../hooks/use-session";
import type { Agent } from "../../lib/types";
import type { ShareAction } from "../agent/agent-access-model.ts";
import type { ShareAgentMutation } from "../agent/use-share-agent";
import {
  agentPeopleView,
  agentPersonNeedsConfirm,
  buildAgentPeople,
  type AgentPersonRow as PersonRow,
  writeAgentPerson,
} from "./agent-people-model.ts";
import { AgentPersonRow } from "./agent-person-row.tsx";

export function AgentPeopleTab({
  agent,
  members,
  share,
  readOnly = false,
  note,
}: {
  agent: Agent;
  members: OrgMember[];
  share: ShareAgentMutation;
  readOnly?: boolean;
  note?: string;
}) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const { profiles } = useUserProfiles(members.map((m) => m.userId));
  const [pending, setPending] = useState<{
    row: PersonRow;
    action: ShareAction;
  } | null>(null);

  const rows = buildAgentPeople({
    agent,
    members,
    selfId,
    unnamedAccount: t("people.roster.unnamedAccount"),
  });

  const write = (userId: string, action: ShareAction) =>
    share.mutate({
      agentId: agent.id,
      members,
      assignments: writeAgentPerson({
        agent,
        members,
        selfId,
        userId,
        action,
      }),
    });

  const handleAction = (row: PersonRow, action: ShareAction) => {
    if (agentPersonNeedsConfirm(row, action)) {
      setPending({ row, action });
      return;
    }
    write(row.member.userId, action);
  };

  const view = agentPeopleView(rows.length, readOnly);

  if (view === "viewerOnly") {
    return (
      <p className="text-sm text-ink-muted">
        {t("permissions.agentPeople.viewerOnly")}
      </p>
    );
  }

  if (view === "empty") {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("permissions.agentPeople.empty.title")}</EmptyTitle>
        <EmptyDescription>
          {t("permissions.agentPeople.empty.body")}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="w-full">
      {note && <p className="mb-4 text-sm text-ink-muted">{note}</p>}
      <ul className="grid grid-cols-1 gap-1">
        {rows.map((row) => (
          <AgentPersonRow
            key={row.member.userId}
            row={row}
            avatarUrl={avatarUrlFromProfiles(profiles, row.member.userId)}
            disabled={share.isPending}
            readOnly={readOnly}
            onAction={(action) => handleAction(row, action)}
          />
        ))}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title={t("share.selfLockout.title")}
        description={t("share.selfLockout.description")}
        confirmLabel={t("share.selfLockout.confirm")}
        cancelLabel={t("share.selfLockout.cancel")}
        variant="destructive"
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) write(p.row.member.userId, p.action);
        }}
      />
    </div>
  );
}
