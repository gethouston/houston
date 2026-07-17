import {
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { useSession } from "../../hooks/use-session";
import type { Agent } from "../../lib/types";
import type { ShareAction } from "../tabs/agent-access-model.ts";
import { useShareAgent } from "../tabs/use-share-agent";
import {
  agentPeopleView,
  agentPersonNeedsConfirm,
  buildAgentPeople,
  type AgentPersonRow as PersonRow,
  writeAgentPerson,
} from "./agent-people-model.ts";
import { AgentPersonRow } from "./agent-person-row.tsx";

/**
 * Permissions agent People tab: WHO can use THIS agent. Every org member is a
 * row with a None / Can use / Manager control for this one agent. Reads and
 * writes reuse the Share dialog's `agent-access-model` (`buildAgentPeople` wraps
 * `buildSharePeople`; `writeAgentPerson` wraps `applyShareAction`) over the
 * optimistic set-replace `useShareAgent`, so an everyone-agent materializes into
 * an explicit roster on first edit exactly as the dialog does, failures already
 * surface as a toast, and a self-lockout is confirm-gated identically.
 *
 * `readOnly` renders the roster with static level labels and NO controls — the
 * face shown on the agent's own Permissions tab to a viewer who can't manage it.
 * The gateway only serves the roster to owner/admin, so a plain member's `members`
 * arrives empty; there the tab degrades to an honest viewer line (`viewerOnly`)
 * rather than a misleading empty state. The gateway is the real enforcer.
 */
export function AgentPeopleTab({
  agent,
  members,
  readOnly = false,
}: {
  agent: Agent;
  members: OrgMember[];
  /** View-only: static rows, no controls, and the plain-member viewer line. */
  readOnly?: boolean;
}) {
  const { t } = useTranslation("teams");
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const share = useShareAgent();
  const { profiles } = useUserProfiles(members.map((m) => m.userId));
  const [pending, setPending] = useState<{
    row: PersonRow;
    action: ShareAction;
  } | null>(null);

  const rows = buildAgentPeople({ agent, members, selfId });

  const write = (userId: string, action: ShareAction) =>
    share.mutate({
      agentId: agent.id,
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

  // Width belongs to the mounting surface; the tab body fills the page column
  // so its rows align with the tab strip above (never a second, narrower column).
  return (
    <div className="w-full">
      {readOnly && (
        <p className="mb-4 text-sm text-ink-muted">
          {t("permissions.agentPeople.readOnlyHint")}
        </p>
      )}
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
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) write(p.row.member.userId, p.action);
        }}
      />
    </div>
  );
}
