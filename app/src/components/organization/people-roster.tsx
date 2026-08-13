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
import { GRANTABLE_ROLES } from "../../lib/org-roles";
import {
  canEditMember,
  grantsOwner,
  initialsFor,
  memberLabel,
} from "./people-tab-model";

/**
 * The People roster: one row per member with an avatar, name/email, and a role.
 * Owners get a role dropdown and a confirm-gated Remove for everyone but
 * themselves; admins see those read-only. Other OWNER rows are editable too
 * (multi-owner orgs), with two confirm gates: removing anyone, and granting
 * owner (full org authority). Demoting/removing a sole owner is refused by the
 * gateway's `last_owner` 409, surfaced as a plain informational toast. The role
 * Select and Remove disable while their mutation is in flight. This is
 * membership only — inspecting a person's per-agent access lives in the
 * Permissions view, so a row's identity is not a drill-in here.
 */
type PendingAction =
  | { kind: "remove"; member: OrgMember }
  | { kind: "makeOwner"; member: OrgMember };

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

  const roleLabel = (role: OrgRole) => t(`people.roles.${role}`);

  const confirmPending = () => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === "remove") {
      removeMember.mutate(action.member.userId);
    } else {
      setRole.mutate({ userId: action.member.userId, role: "owner" });
    }
  };

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-ink">
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
          // Display name is primary when the gateway resolved one; the email
          // then drops to a muted secondary line. Falls back to email/id.
          const name = member.displayName ?? memberLabel(member);
          const secondaryEmail =
            member.displayName && member.email ? member.email : null;
          const avatarUrl = member.photoUrl ?? null;
          return (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-xl border border-ink/5 bg-card px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar>
                  {avatarUrl && (
                    <AvatarImage
                      src={avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <AvatarFallback className="text-xs">
                    {initialsFor(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">
                    {name}
                    {isSelf && (
                      <span className="ml-2 text-xs text-ink-muted">
                        {t("people.roster.you")}
                      </span>
                    )}
                  </div>
                  {secondaryEmail && (
                    <div className="truncate text-xs text-ink-muted">
                      {secondaryEmail}
                    </div>
                  )}
                </div>
              </div>
              {editable ? (
                <Select
                  value={member.role}
                  disabled={setRole.isPending}
                  onValueChange={(v) => {
                    const role = v as OrgRole;
                    if (role === member.role) return;
                    if (grantsOwner(role, member.role)) {
                      setPending({ kind: "makeOwner", member });
                      return;
                    }
                    setRole.mutate({ userId: member.userId, role });
                  }}
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
                <span className="rounded-full bg-chip px-3 py-1 text-xs text-ink-muted">
                  {roleLabel(member.role)}
                </span>
              )}
              {editable && (
                <Button
                  variant="ghost"
                  className="rounded-full text-danger hover:text-danger"
                  disabled={removeMember.isPending}
                  aria-label={t("people.roster.removeLabel", {
                    name: memberLabel(member),
                  })}
                  onClick={() => setPending({ kind: "remove", member })}
                >
                  {t("people.roster.remove")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          pending?.kind === "makeOwner"
            ? t("people.makeOwnerConfirm.title", {
                name: pending ? memberLabel(pending.member) : "",
              })
            : t("people.removeConfirm.title", {
                name: pending ? memberLabel(pending.member) : "",
              })
        }
        description={
          pending?.kind === "makeOwner"
            ? t("people.makeOwnerConfirm.description")
            : t("people.removeConfirm.description")
        }
        confirmLabel={
          pending?.kind === "makeOwner"
            ? t("people.makeOwnerConfirm.confirm")
            : t("people.removeConfirm.confirm")
        }
        cancelLabel={t("people.removeConfirm.cancel")}
        onConfirm={confirmPending}
      />
    </section>
  );
}
