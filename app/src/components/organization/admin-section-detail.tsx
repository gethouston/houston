import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer, PageHeader } from "../shell/page-shell";
import ActivityTab from "./activity-tab";
import BillingTab from "./billing-tab";
import MembersTab from "./members-tab";
import type { OrgTabId } from "./org-view-model";
import type { OrgTabProps, OrgViewContext } from "./organization-view";
import UsageTab from "./usage-tab";

/** Each Organization section renders from the shared `{ ctx }` contract. */
const SECTION_COMPONENTS: Record<OrgTabId, (props: OrgTabProps) => ReactNode> =
  {
    people: MembersTab,
    activity: ActivityTab,
    usage: UsageTab,
    billing: BillingTab,
  };

/**
 * A section's detail body inside the Admin dashboard: the section heading over
 * its content. Every section renders from the shared `{ ctx }` contract (no
 * drill-ins remain here — the member/agent access lenses moved to the
 * Permissions view). Extracted from `organization-view.tsx` so the shell stays a
 * thin index/detail switch.
 */
export function AdminSectionDetail({
  active,
  ctx,
  isLoading,
}: {
  active: OrgTabId;
  ctx: OrgViewContext | null;
  isLoading: boolean;
}) {
  const { t } = useTranslation("teams");
  const Section = SECTION_COMPONENTS[active];
  return (
    <PageContainer className="pb-10">
      <PageHeader title={t(`org.tabs.${active}`)} className="mb-6" />
      {ctx ? (
        <Section ctx={ctx} />
      ) : (
        <p className="py-10 text-sm text-ink-muted">
          {isLoading ? t("org.loading") : t("org.unavailable")}
        </p>
      )}
    </PageContainer>
  );
}
