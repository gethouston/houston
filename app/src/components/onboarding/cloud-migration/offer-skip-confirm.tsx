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
          <AlertDialogAction variant="ghost" onClick={onConfirmSkip}>
            {t("offer.skipConfirm.confirm")}
          </AlertDialogAction>
          <AlertDialogCancel ref={goBackRef} variant="default">
            {t("offer.skipConfirm.goBack")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
