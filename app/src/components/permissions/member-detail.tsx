import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  ConfirmDialog,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { useAgentStore } from "../../stores/agents";
import { initialsFor, memberLabel } from "../organization/people-tab-model.ts";
import type { ShareAction } from "../tabs/agent-access-model.ts";
import { useShareAgent } from "../tabs/use-share-agent";
import {
  MemberAgentRow,
  type MemberAgentRowKind,
} from "./member-agent-row.tsx";
import {
  canMemberBeManager,
  type MemberAgentRow as MemberRow,
  memberActionNeedsConfirm,
  memberAgentAccess,
  writeMemberAssignment,
} from "./member-detail-model.ts";

/** The explicit-roster row's presentation, decided by member + viewer authority. */
function explicitKind(member: OrgMember, canEdit: boolean): MemberAgentRowKind {
  if (member.role === "owner") return "owner";
  return canEdit ? "editable" : "readOnly";
}

/**
 * Permissions > People per-member access lens: one PERSON, the agents
 * they can reach, and (owner-first) a control to change it. The header is the
 * member's identity; the body splits the caller-visible fleet into agents shared
 * with everyone (read-only) and explicit-roster agents (each with the member's
 * current level, editable only where the viewer manages the agent). Writes reuse
 * the Share dialog's optimistic `useShareAgent` + set-replace `setAgentAssignments`
 * so failures already surface as a toast; a self-lockout is confirm-gated exactly
 * as the dialog does. The gateway is the sole enforcer; these gates only hide
 * dead affordances.
 */
export function MemberDetail({ member }: { member: OrgMember }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const agents = useAgentStore((s) => s.agents);
  const share = useShareAgent();
  const { profiles } = useUserProfiles([member.userId]);
  const [pending, setPending] = useState<{
    row: MemberRow;
    action: ShareAction;
  } | null>(null);

  const { everyone, explicit } = memberAgentAccess(
    member,
    agents,
    capabilities,
  );
  const canBeManager = canMemberBeManager(member.role);
  const isSelf = member.userId === selfId;
  const avatarUrl = avatarUrlFromProfiles(profiles, member.userId);

  const write = (row: MemberRow, action: ShareAction) =>
    share.mutate({
      agentId: row.agent.id,
      assignments: writeMemberAssignment(row.agent, member, action),
    });

  const handleAction = (row: MemberRow, action: ShareAction) => {
    if (memberActionNeedsConfirm({ member, selfId, action })) {
      setPending({ row, action });
      return;
    }
    write(row, action);
  };

  return (
    <div className="flex flex-col gap-8 py-6">
      <header className="flex items-center gap-3">
        <Avatar>
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xs">
            {initialsFor(memberLabel(member))}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">
            {memberLabel(member)}
            {isSelf && (
              <span className="ml-2 text-xs text-ink-muted">
                {t("people.roster.you")}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-chip px-3 py-1 text-xs text-ink-muted">
          {t(`people.roles.${member.role}`)}
        </span>
      </header>

      {everyone.length === 0 && explicit.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("org.memberDetail.empty")}</p>
      ) : null}

      {everyone.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink">
            {t("org.memberDetail.everyone.title")}
          </h2>
          <ul className="space-y-2">
            {everyone.map((row) => (
              <MemberAgentRow
                key={row.agent.id}
                agent={row.agent}
                access={row.access}
                kind="everyone"
                canBeManager={canBeManager}
              />
            ))}
          </ul>
        </section>
      )}

      {explicit.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink">
            {t("org.memberDetail.explicit.title")}
          </h2>
          <ul className="space-y-2">
            {explicit.map((row) => (
              <MemberAgentRow
                key={row.agent.id}
                agent={row.agent}
                access={row.access}
                kind={explicitKind(member, row.canEdit)}
                canBeManager={canBeManager}
                disabled={share.isPending}
                onAction={(action) => handleAction(row, action)}
              />
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title={t("share.selfLockout.title")}
        description={t("share.selfLockout.description")}
        confirmLabel={t("share.selfLockout.confirm")}
        cancelLabel={t("share.selfLockout.cancel")}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) write(p.row, p.action);
        }}
      />
    </div>
  );
}
