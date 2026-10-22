import type { OrgMember } from "@houston/engine-adapter";
import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { PeopleRemoveConfirm } from "./people-remove-confirm";
import { rosterPersonName } from "./people-tab-model";

/** The two roster actions that ask before they happen. */
export type PendingAction =
  | { kind: "remove"; member: OrgMember }
  | { kind: "makeOwner"; member: OrgMember };

/**
 * The roster's confirm gates, worn by both actions that cannot be taken back
 * from the UI: removing somebody, and handing out OWNER authority (full org
 * control, membership and billing included). Removal has its own dialog
 * because it also lists the routines the person set up, which stop with them.
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
  const owner = pending?.kind === "makeOwner" ? pending.member : null;

  return (
    <>
      <ConfirmDialog
        open={owner !== null}
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
        title={t("people.makeOwnerConfirm.title", {
          name: owner
            ? rosterPersonName(owner, t("people.roster.unnamedAccount"))
            : "",
        })}
        description={t("people.makeOwnerConfirm.description")}
        confirmLabel={t("people.makeOwnerConfirm.confirm")}
        cancelLabel={t("people.removeConfirm.cancel")}
        onConfirm={onConfirm}
      />
      <PeopleRemoveConfirm
        member={pending?.kind === "remove" ? pending.member : null}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </>
  );
}
