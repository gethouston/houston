import { Button, Card } from "@houston-ai/core";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../../../hooks/use-surface-gates";
import { openAdmin } from "../../../lib/open-admin";
import { useUIStore } from "../../../stores/ui";
import { FreeOrgChoiceRow } from "./free-org-choice-row";

/**
 * Settings > Billing: the free-org pick while it is still open. What an org
 * costs lives in that org's Admin > Billing, so this screen points there for
 * whoever can see it (a link from the Stripe portal still lands here).
 */
export function PlanSection() {
  const { t } = useTranslation("plan");
  const openSettings = useUIStore((s) => s.openSettings);
  const { showBilling } = useSurfaceGates();
  // Where a closed free-org picker returns focus once its row is gone.
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <section className="space-y-5 py-6 text-ink md:space-y-6">
      <header className="space-y-2 pb-2">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-normal text-balance outline-none"
        >
          {t("title")}
        </h1>
        <p className="text-sm text-ink-muted">
          {t("questions")}{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => openSettings("reportBug")}
          >
            {t("contact")}
          </Button>
        </p>
      </header>
      <FreeOrgChoiceRow fallbackFocus={heading} />
      {showBilling && (
        <Card className="gap-0 px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-medium">{t("orgBilling.title")}</h2>
              <p className="text-sm text-ink-muted">{t("orgBilling.body")}</p>
            </div>
            <Button
              variant="outline"
              className="self-start md:self-auto"
              onClick={() => openAdmin({ section: "billing" })}
            >
              {t("orgBilling.open")}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
