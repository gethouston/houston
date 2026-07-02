import {
  Button,
  ConfirmDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@houston-ai/core";
import type { OrgMember, OrgRole } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAddMember,
  useOrg,
  useRemoveMember,
  useSetMemberRole,
} from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useSession } from "../../../hooks/use-session";
import { GRANTABLE_ROLES, isMultiplayer } from "../../../lib/org-roles";

/**
 * The org Members surface. Owner can add / re-role / remove; admin sees the
 * roster read-only (the mutating controls are hidden, and the gateway enforces
 * the same for real). Gated at the nav level on `canSeeMembers`, so this only
 * mounts for owner/admin in a multiplayer deployment.
 */
export function MembersSection() {
  const { t } = useTranslation("org");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const org = useOrg(isMultiplayer(capabilities));
  const addMember = useAddMember();
  const setRole = useSetMemberRole();
  const removeMember = useRemoveMember();

  const isOwner = org.data?.role === "owner";
  const selfId = session?.user?.id ?? null;
  const members = org.data?.members ?? [];

  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<OrgRole>("user");
  const [pendingRemove, setPendingRemove] = useState<OrgMember | null>(null);

  const roleLabel = (role: OrgRole) => t(`members.roles.${role}`);

  const handleAdd = async () => {
    const value = email.trim();
    if (!value || addMember.isPending) return;
    try {
      await addMember.mutateAsync({ email: value, role: newRole });
      setEmail("");
      setNewRole("user");
    } catch {
      // call() already surfaced the reason (unknown email, already in another
      // org 409, ...); keep the typed email so the user can fix and retry.
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("members.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("members.description")}
      </p>

      {!isOwner && (
        <p className="text-xs text-muted-foreground mb-4">
          {t("members.adminNotice")}
        </p>
      )}

      {isOwner && (
        <div className="mb-6 rounded-xl border border-black/5 bg-secondary p-4">
          <h3 className="text-sm font-medium mb-3">{t("members.add.title")}</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="add-member-email"
                className="text-xs text-muted-foreground block mb-1.5"
              >
                {t("members.add.emailLabel")}
              </label>
              <input
                id="add-member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                }}
                placeholder={t("members.add.emailPlaceholder")}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-ring transition-all"
              />
            </div>
            <div className="sm:w-40">
              <label
                htmlFor="add-member-role"
                className="text-xs text-muted-foreground block mb-1.5"
              >
                {t("members.add.roleLabel")}
              </label>
              <Select
                value={newRole}
                onValueChange={(v) => setNewRole(v as OrgRole)}
              >
                <SelectTrigger id="add-member-role" className="rounded-xl">
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
            </div>
            <Button
              className="rounded-full"
              disabled={!email.trim() || addMember.isPending}
              onClick={() => void handleAdd()}
            >
              {addMember.isPending
                ? t("members.add.adding")
                : t("members.add.submit")}
            </Button>
          </div>
        </div>
      )}

      {org.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("members.roster.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => {
            const isSelf = member.userId === selfId;
            const canEdit = isOwner && !isSelf && member.role !== "owner";
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
      )}

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
    </section>
  );
}
