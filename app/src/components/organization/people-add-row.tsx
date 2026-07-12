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
import { useAddMember } from "../../hooks/queries";
import { GRANTABLE_ROLES } from "../../lib/org-roles";
import { type AddOutcome, describeAddResult } from "./people-tab-model";

/**
 * The owner-only "Add someone" row on the People tab: email + role (Manager /
 * Member, each with a plain-language explanation) → `POST /org/members`. A known
 * user is added directly; an unknown email becomes a pending invite (`202`), and
 * we confirm which happened inline. Failures (already a member, another org)
 * reach the user as a toast from the `call()` wrapper, so no `onError` here.
 */
export function PeopleAddRow() {
  const { t } = useTranslation("teams");
  const addMember = useAddMember();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("user");
  const [outcome, setOutcome] = useState<AddOutcome | null>(null);

  const submit = async () => {
    const value = email.trim();
    if (!value || addMember.isPending) return;
    try {
      const result = await addMember.mutateAsync({ email: value, role });
      setOutcome(describeAddResult(value, result));
      setEmail("");
      setRole("user");
    } catch {
      // call() already surfaced the reason (already a member, another org, ...);
      // keep the typed email so the owner can fix and retry.
    }
  };

  return (
    <section className="rounded-2xl border border-ink/5 bg-chip p-4">
      <h2 className="mb-1 text-sm font-medium text-ink">
        {t("people.add.title")}
      </h2>
      <p className="mb-3 text-xs text-ink-muted">{t("people.add.subtitle")}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="org-add-email"
            className="mb-1.5 block text-xs text-ink-muted"
          >
            {t("people.add.emailLabel")}
          </label>
          <Input
            id="org-add-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setOutcome(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={t("people.add.emailPlaceholder")}
            className="rounded-xl bg-card"
          />
        </div>
        <div className="sm:w-44">
          <label
            htmlFor="org-add-role"
            className="mb-1.5 block text-xs text-ink-muted"
          >
            {t("people.add.roleLabel")}
          </label>
          <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
            <SelectTrigger id="org-add-role" className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANTABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`people.roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AsyncButton
          className="rounded-full"
          disabled={!email.trim()}
          onClick={() => submit()}
        >
          {t("people.add.submit")}
        </AsyncButton>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {t(`people.roleHelp.${role}`)}
      </p>
      <p aria-live="polite" className="mt-2 min-h-4 text-xs text-success">
        {outcome?.kind === "added" &&
          t("people.add.added", { email: outcome.email })}
        {outcome?.kind === "invited" &&
          t("people.add.invited", { email: outcome.email })}
      </p>
    </section>
  );
}
