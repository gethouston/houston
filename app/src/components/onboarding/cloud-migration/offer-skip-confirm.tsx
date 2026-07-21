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
import { useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * Confirmation for the offer screen's honest "start without my assistants"
 * escape. Skipping the migration starts the cloud app EMPTY — the user's
 * existing assistants and conversations stay in their old local data and do not
 * appear here — so this step states that plainly while reassuring that nothing
 * is deleted (their data stays safe on this computer) and the move can be
 * resumed anytime from Settings. The quiet action performs the exact same skip
 * as before; the primary, default-focused action returns to the offer.
 */
export function OfferSkipConfirm({
  open,
  onOpenChange,
  onConfirmSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSkip: () => void;
}) {
  const { t } = useTranslation("migration");
  const goBackRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          goBackRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("offer.skipConfirm.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("offer.skipConfirm.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Quiet, on the left: the honest escape wired to the same skip
              handler as before. */}
          <AlertDialogAction variant="ghost" onClick={onConfirmSkip}>
            {t("offer.skipConfirm.confirm")}
          </AlertDialogAction>
          {/* Primary + default focus: the safe path back to the migration. */}
          <AlertDialogCancel ref={goBackRef} variant="default">
            {t("offer.skipConfirm.goBack")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
