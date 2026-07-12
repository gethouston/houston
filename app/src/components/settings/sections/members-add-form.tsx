import {
  AsyncButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import type { OrgRole } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAddMember } from "../../../hooks/queries";
import { GRANTABLE_ROLES } from "../../../lib/org-roles";

/**
 * The owner-only "Add someone" form on the Members surface: email + role →
 * `POST` via `useAddMember`. Rendering is gated by the parent on
 * `canManageMembers`; the gateway enforces the same for real.
 */
export function AddMemberForm() {
  const { t } = useTranslation("org");
  const addMember = useAddMember();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<OrgRole>("user");

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
    <div className="mb-6 rounded-xl border border-ink/5 bg-chip p-4">
      <h3 className="text-sm font-medium mb-3">{t("members.add.title")}</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="add-member-email"
            className="text-xs text-ink-muted block mb-1.5"
          >
            {t("members.add.emailLabel")}
          </label>
          <Input
            id="add-member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
            placeholder={t("members.add.emailPlaceholder")}
            className="rounded-xl bg-card"
          />
        </div>
        <div className="sm:w-40">
          <label
            htmlFor="add-member-role"
            className="text-xs text-ink-muted block mb-1.5"
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
                  {t(`members.roles.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AsyncButton
          className="rounded-full"
          disabled={!email.trim()}
          onClick={() => handleAdd()}
        >
          {t("members.add.submit")}
        </AsyncButton>
      </div>
    </div>
  );
}
