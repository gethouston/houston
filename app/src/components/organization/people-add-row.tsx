import type { OrgRole } from "@houston/engine-adapter";
import { seatAddBlocked } from "@houston/sdk";
import {
  AsyncButton,
  ConfirmDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GRANTABLE_ROLES } from "../../lib/org-roles";
import { PeopleAddDone } from "./people-add-done";
import { PeopleSeatNote } from "./people-seat-note";
import { type AddOutcome, grantsOwner } from "./people-tab-model";
import { SeatChargeDialog } from "./seat-charge-dialog";
import { useSeatAdd } from "./use-seat-add";

/**
 * The owner-only "Add someone" row on the People tab: email + role (Owner /
 * Manager / Member, each with a plain-language explanation) →
 * `POST /org/members`. A known user is added directly; an unknown email becomes
 * a pending invite (`202`), and we confirm which happened inline. Adding
 * someone as OWNER (full org authority, billing included) is confirm-gated
 * before the request fires. A note under the form says what a new seat costs
 * (`useSeatAdd`): on a yearly org with every paid seat in use, the payer
 * confirms the charge in a dialog first, and another owner cannot add at all.
 * Unexpected failures (already a member, another org) reach the reporting
 * paths through the `call()` wrapper, so no `onError` here.
 */
export function PeopleAddRow() {
  const { t } = useTranslation("teams");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("user");
  const [outcome, setOutcome] = useState<AddOutcome | null>(null);
  const [confirmOwner, setConfirmOwner] = useState(false);
  const seat = useSeatAdd((done) => {
    setOutcome(done);
    setEmail("");
    setRole("user");
  });
  const blocked =
    seatAddBlocked(seat.quote) ||
    (!seat.purchasable && seat.quote?.kind === "charge");

  const send = () => {
    const value = email.trim();
    if (!value || seat.pending) return Promise.resolve();
    return seat.start(value, role);
  };

  const submit = async () => {
    if (!email.trim() || seat.pending || blocked) return;
    if (grantsOwner(role)) {
      setConfirmOwner(true);
      return;
    }
    await send();
  };

  return (
    <section className="rounded-2xl border border-ink/5 bg-chip p-4">
      <h2 className="mb-1 text-sm font-medium text-ink">
        {t("people.add.title")}
      </h2>
      <p className="mb-3 text-xs text-ink-muted">{t("people.add.subtitle")}</p>
      <div className="flex flex-col gap-2 md:flex-row md:items-end">
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
        <div className="md:w-44">
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
          className="self-start rounded-full md:self-auto"
          disabled={!email.trim() || blocked}
          onClick={() => submit()}
        >
          {t("people.add.submit")}
        </AsyncButton>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {t(`people.roleHelp.${role}`)}
      </p>
      <PeopleSeatNote
        quote={seat.quote}
        billing={seat.billing}
        purchasable={seat.purchasable}
      />
      <PeopleAddDone outcome={outcome} />
      <ConfirmDialog
        open={confirmOwner}
        onOpenChange={setConfirmOwner}
        title={t("people.makeOwnerConfirm.title", { name: email.trim() })}
        description={t("people.makeOwnerConfirm.description")}
        confirmLabel={t("people.makeOwnerConfirm.confirm")}
        cancelLabel={t("people.removeConfirm.cancel")}
        onConfirm={() => {
          setConfirmOwner(false);
          void send();
        }}
      />
      <SeatChargeDialog
        dialog={seat.dialog}
        billing={seat.billing}
        onPay={seat.pay}
        onCancel={seat.cancel}
        onPortalOpened={seat.portalOpened}
      />
    </section>
  );
}
