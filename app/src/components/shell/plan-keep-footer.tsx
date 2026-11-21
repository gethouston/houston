import { Button, DialogFooter } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { PlanWebNote } from "./plan-web-note";

export function PlanKeepFooter({
  offer,
  onClose,
  onUpgrade,
}: {
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
