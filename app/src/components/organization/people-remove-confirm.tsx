import type { OrgMember } from "@houston/engine-adapter";
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
import { removeRoutinesNote } from "./people-remove-model";
import { PeopleRemoveRoutines } from "./people-remove-routines";
import { rosterPersonName } from "./people-tab-model";

/**
 * Asks before removing `member` (null = closed), and lists the routines they
 * set up that the removal would stop. The routines read never gates the
 * button: a removal is the owner's call whether or not the check answered.
 */
export function PeopleRemoveConfirm({
  member,
  onCancel,
  onConfirm,
}: {
  member: OrgMember | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("teams");
  // The dialog fades out after `member` clears: keep showing who it was
  // about until then, instead of a blank title and a loading note.
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
