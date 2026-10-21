import { Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/** The Billing tab while the orgs list loads, shaped like its two cards. */
export function BillingTabSkeleton() {
  const { t } = useTranslation("teams");
  return (
    <div
      className="flex max-w-xl flex-col gap-4 py-6 md:gap-5"
      role="status"
      aria-label={t("billing.loading")}
    >
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
