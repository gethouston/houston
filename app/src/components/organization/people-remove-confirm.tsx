import type { OrgMember } from "@houston/engine-adapter";
import { formatLocalDate, seatRemoveNote } from "@houston/sdk";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMemberRoutines } from "../../hooks/queries";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { removeRoutinesNote } from "./people-remove-model";
import { PeopleRemoveRoutines } from "./people-remove-routines";
import { rosterPersonName } from "./people-tab-model";

export function PeopleRemoveConfirm({
  member,
  onCancel,
  onConfirm,
}: {
  member: OrgMember | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t, i18n } = useTranslation("teams");
  const seat = seatRemoveNote(useActiveOrgBilling().billing);
  const [shown, setShown] = useState(member);
  if (member !== null && member !== shown) setShown(member);
  const open = member !== null;
  const read = useMemberRoutines(shown?.userId ?? null, open);
  const name = shown
    ? rosterPersonName(shown, t("people.roster.unnamedAccount"))
    : "";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("people.removeConfirm.title", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("people.removeConfirm.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {seat && (
          <p className="rounded-2xl border border-line bg-chip px-3.5 py-3 text-sm">
            {seat.kind === "year"
              ? t("people.removeConfirm.seatYear", {
                  date: formatLocalDate(seat.renewsAt, i18n.language),
                })
              : t("people.removeConfirm.seatMonth", {
                  date: formatLocalDate(seat.nextBillAt, i18n.language),
                })}
          </p>
        )}
        <PeopleRemoveRoutines note={removeRoutinesNote(read)} />
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("people.removeConfirm.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("people.removeConfirm.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
