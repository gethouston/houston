import {
  Button,
  ConfirmDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import type { OrgMember, OrgRole } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRemoveMember, useSetMemberRole } from "../../../hooks/queries";
import { GRANTABLE_ROLES } from "../../../lib/org-roles";

/**
 * The Members roster: one row per member with a role pill, and — when the
 * viewer may mutate (`canManage`, owner only per C3) — a role select and a
 * confirm-gated Remove for everyone but themselves and the owner row.
 */
export function MemberRoster({
  members,
  selfId,
  canManage,
}: {
  members: OrgMember[];
  selfId: string | null;
  canManage: boolean;
}) {
  const { t } = useTranslation("org");
  const setRole = useSetMemberRole();
  const removeMember = useRemoveMember();
  const [pendingRemove, setPendingRemove] = useState<OrgMember | null>(null);

  const roleLabel = (role: OrgRole) => t(`members.roles.${role}`);

  return (
    <>
      <ul className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === selfId;
          const canEdit = canManage && !isSelf && member.role !== "owner";
          return (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-xl border border-black/5 bg-card px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {member.email ?? member.userId}
                  {isSelf && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("members.roster.you")}
                    </span>
                  )}
                </div>
              </div>
              {canEdit ? (
                <Select
                  value={member.role}
                  onValueChange={(v) =>
                    setRole.mutate({
                      userId: member.userId,
                      role: v as OrgRole,
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 w-32 rounded-full"
                    aria-label={t("members.roster.changeRole")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANTABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  {roleLabel(member.role)}
                </span>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  className="rounded-full text-destructive hover:text-destructive"
                  onClick={() => setPendingRemove(member)}
                >
                  {t("members.roster.remove")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("members.removeConfirm.title")}
        description={t("members.removeConfirm.description")}
        confirmLabel={t("members.removeConfirm.confirm")}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target) removeMember.mutate(target.userId);
        }}
      />
    </>
  );
}
