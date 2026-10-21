import { Button, DialogFooter } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { PlanWebNote } from "./plan-web-note";

/**
 * The keep dialog's way out: Upgrade where Plus would pay for the org and
 * Houston may sell, the managed-on-the-web line in the store apps, and a plain
 * Not now everywhere Plus would not help, since the dialog has no close button.
 */
export function PlanKeepFooter({
  plusOffer,
  onClose,
  onUpgrade,
}: {
  plusOffer: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const { t } = useTranslation("plan");
  return (
    <DialogFooter>
      {!plusOffer ? (
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
