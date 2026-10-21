import { Button, DialogFooter } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { PlanWebNote } from "./plan-web-note";

/**
 * The keep dialog's way out: Upgrade (the org's Billing) for its billing
 * owner where Houston may sell, the managed-on-the-web line for them in the
 * store apps, and a plain Not now for everyone else, since the dialog has no
 * close button.
 */
export function PlanKeepFooter({
  offer,
  onClose,
  onUpgrade,
}: {
  /** The reader pays for the org, so upgrading is theirs to do. */
  offer: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation("plan");
  return (
    <DialogFooter>
      {!offer ? (
        <Button variant="outline" onClick={onClose}>
          {t("notNow")}
        </Button>
      ) : canPurchaseInApp() ? (
        <Button variant="outline" onClick={onUpgrade}>
          {t("upgrade")}
        </Button>
      ) : (
        <PlanWebNote variant="manage" />
      )}
    </DialogFooter>
  );
}
