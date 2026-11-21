import type { OrgMember } from "@houston/engine-adapter";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRemoveMember, useSetMemberRole } from "../../hooks/queries";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import {
  type PendingAction,
  PeopleRosterConfirm,
} from "./people-roster-confirm";
import { PeopleRosterRow } from "./people-roster-row";
import { canEditMember, grantsOwner } from "./people-tab-model";
import { usePersonFocus } from "./use-person-focus";

export function PeopleRoster({
  members,
  selfId,
  canManage,
}: {
  members: OrgMember[];
  selfId: string | null;
  canManage: boolean;
}) {
  const { t } = useTranslation("teams");
  const setRole = useSetMemberRole();
  const removeMember = useRemoveMember();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const { focused, listRef } = usePersonFocus();
  const { billing } = useActiveOrgBilling();
  const selfPays = billing?.tier === "paid" && billing.isBillingOwner;

  const confirmPending = () => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === "remove") {
      removeMember(action.member.userId);
    } else {
      setRole(action.member.userId, "owner");
    }
  };

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-ink">
        {t("people.roster.title")}
      </h2>
      <ul ref={listRef} className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === selfId;
          return (
            <PeopleRosterRow
              key={member.userId}
              member={member}
              isSelf={isSelf}
              pays={isSelf && selfPays}
              editable={canEditMember({
                canManage,
                isSelf,
                role: member.role,
              })}
              focused={member.userId === focused}
              onRole={(role) => {
                if (role === member.role) return;
                if (grantsOwner(role, member.role)) {
                  setPending({ kind: "makeOwner", member });
                  return;
                }
                setRole(member.userId, role);
              }}
              onRemove={() => setPending({ kind: "remove", member })}
            />
          );
        })}
      </ul>

      <PeopleRosterConfirm
        pending={pending}
        onCancel={() => setPending(null)}
        onConfirm={confirmPending}
      />
    </section>
  );
}
