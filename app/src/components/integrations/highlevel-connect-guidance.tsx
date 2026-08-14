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
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * HighLevel's agency-level installer does not return the connection callback
 * Composio needs. This one-app interstitial gives users the exact choice that
 * works before Houston opens HighLevel, while every other toolkit keeps its
 * immediate connect hand-off.
 */
export function HighLevelConnectGuidance({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("integrations");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("highlevelGuidance.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("highlevelGuidance.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-lg border border-line bg-input p-3">
          <p className="mb-2 text-sm font-medium text-ink">
            {t("highlevelGuidance.whenPageOpens")}
          </p>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="font-medium text-ink">
              {t("highlevelGuidance.houstonAppName")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-line bg-dialog px-2 py-1 text-ink">
              {t("highlevelGuidance.agencyView")}
              <ChevronDown className="size-3.5" aria-hidden />
            </span>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
            <li>{t("highlevelGuidance.openDropdown")}</li>
            <li>{t("highlevelGuidance.chooseSubAccount")}</li>
            <li>{t("highlevelGuidance.selectLocation")}</li>
          </ol>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("highlevelGuidance.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>
            {t("highlevelGuidance.continue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
