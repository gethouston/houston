import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "../shell/page-shell";
import AnalyticsTab from "./analytics-tab";
import BillingTab from "./billing-tab";
import CompanyContextTab from "./company-context-tab";
import MembersTab from "./members-tab";
import type { OrgTabId } from "./org-view-model";
import type { OrgTabProps, OrgViewContext } from "./organization-view";

/** Each Organization section renders from the shared `{ ctx }` contract. */
const SECTION_COMPONENTS: Record<OrgTabId, (props: OrgTabProps) => ReactNode> =
  {
    people: MembersTab,
    billing: BillingTab,
    analytics: AnalyticsTab,
    companyContext: CompanyContextTab,
  };

/**
 * The active section's body under the Admin strip. No heading of its own: the
 * header's lozenge already names the section (the shared grammar with
 * Integrations and the team screen), so a hero here would say it twice. Every
 * section renders from the shared `{ ctx }` contract (the activity feed and
 * message usage are lenses INSIDE Analytics, not sections of their own).
 */
export function AdminSectionBody({
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
    <PageContainer className="pt-6 pb-10">
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
