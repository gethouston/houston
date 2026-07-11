import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
import { useRemoveMember, useSetMemberRole } from "../../hooks/queries";
import { useUserProfiles } from "../../hooks/queries/use-user-profiles";
import { avatarUrlFromProfiles } from "../../hooks/queries/user-profiles-map";
import { GRANTABLE_ROLES } from "../../lib/org-roles";
import { canEditMember, initialsFor, memberLabel } from "./people-tab-model";

/**
 * The People roster: one row per member with an avatar, name/email, and a role.
 * Owners get a role dropdown and a confirm-gated Remove for everyone but
 * themselves and the owner row; admins see it read-only. The role Select and
 * Remove disable while their mutation is in flight (loading state); the "last
 * owner" 409 and other failures reach the user as a toast from `call()`.
 */
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
  const { profiles } = useUserProfiles(members.map((m) => m.userId));
  const [pendingRemove, setPendingRemove] = useState<OrgMember | null>(null);

  const roleLabel = (role: OrgRole) => t(`people.roles.${role}`);

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-foreground">
        {t("people.roster.title")}
      </h2>
      <ul className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === selfId;
          const editable = canEditMember({
            canManage,
            isSelf,
            role: member.role,
          });
          const avatarUrl = avatarUrlFromProfiles(profiles, member.userId);
          return (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-xl border border-foreground/5 bg-card px-4 py-3"
            >
              <Avatar>
                {avatarUrl && (
                  <AvatarImage
                    src={avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                )}
                <AvatarFallback className="text-xs">
                  {initialsFor(memberLabel(member))}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {memberLabel(member)}
                  {isSelf && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("people.roster.you")}
                    </span>
                  )}
                </div>
              </div>
              {editable ? (
                <Select
                  value={member.role}
                  disabled={setRole.isPending}
                  onValueChange={(v) =>
                    setRole.mutate({
                      userId: member.userId,
                      role: v as OrgRole,
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 w-32 rounded-full"
                    aria-label={t("people.roster.changeRole", {
                      name: memberLabel(member),
                    })}
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
              {editable && (
                <Button
                  variant="ghost"
                  className="rounded-full text-destructive hover:text-destructive"
                  disabled={removeMember.isPending}
                  aria-label={t("people.roster.removeLabel", {
                    name: memberLabel(member),
                  })}
                  onClick={() => setPendingRemove(member)}
                >
                  {t("people.roster.remove")}
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
        title={t("people.removeConfirm.title", {
          name: pendingRemove ? memberLabel(pendingRemove) : "",
        })}
        description={t("people.removeConfirm.description")}
        confirmLabel={t("people.removeConfirm.confirm")}
        cancelLabel={t("people.removeConfirm.cancel")}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target) removeMember.mutate(target.userId);
        }}
      />
    </section>
  );
}
