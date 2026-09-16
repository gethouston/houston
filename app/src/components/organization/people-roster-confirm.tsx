import type { OrgMember } from "@houston/engine-adapter";
import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { rosterPersonName } from "./people-tab-model";

/** The two roster actions that ask before they happen. */
export type PendingAction =
  | { kind: "remove"; member: OrgMember }
  | { kind: "makeOwner"; member: OrgMember };

/**
 * The roster's one confirm gate, worn by both actions that cannot be taken
 * back from the UI: removing somebody, and handing out OWNER authority (full
 * org control, membership and billing included). One dialog rather than two so
 * the two questions are asked in the same voice; the action decides the copy.
 *
 * Every other role change applies directly — the gateway guards the only
 * dangerous one (`last_owner`), which surfaces as a plain informational toast.
 */
export function PeopleRosterConfirm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingAction | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("teams");
  const owner = pending?.kind === "makeOwner";
  const name = pending ? rosterPersonName(pending.member) : "";

  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={
        owner
          ? t("people.makeOwnerConfirm.title", { name })
          : t("people.removeConfirm.title", { name })
      }
      description={
        owner
          ? t("people.makeOwnerConfirm.description")
          : t("people.removeConfirm.description")
      }
      confirmLabel={
        owner
          ? t("people.makeOwnerConfirm.confirm")
          : t("people.removeConfirm.confirm")
      }
      cancelLabel={t("people.removeConfirm.cancel")}
      onConfirm={onConfirm}
    />
  );
}
