import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "../shell/page-shell";
import AnalyticsTab from "./analytics-tab";
import BillingTab from "./billing-tab";
import CompanyContextTab from "./company-context-tab";
import MembersTab from "./members-tab";
import type { AnalyticsLens, OrgTabId } from "./org-view-model";
import type { OrgTabProps, OrgViewContext } from "./organization-view";

/**
 * Each Organization section renders from the shared `{ ctx }` contract —
 * except Analytics, which also takes the resolved lens and is therefore
 * rendered by name below, not from this record.
 */
const SECTION_COMPONENTS: Record<
  Exclude<OrgTabId, "analytics">,
  (props: OrgTabProps) => ReactNode
> = {
  people: MembersTab,
  billing: BillingTab,
  companyContext: CompanyContextTab,
};

/** Mounts the record's component AS a component, so its hooks stay its own. */
function PlainSection({
  active,
  ctx,
}: {
  active: Exclude<OrgTabId, "analytics">;
  ctx: OrgViewContext;
}) {
  const Section = SECTION_COMPONENTS[active];
  return <Section ctx={ctx} />;
}

/**
 * The active section's body under the Admin strip. No heading of its own: the
 * header's lozenge already names the section (the shared grammar with
 * Integrations and the team screen), so a hero here would say it twice. Every
 * section renders from the shared `{ ctx }` contract; Analytics alone also
 * takes the resolved lens (the activity feed and message usage are lenses
 * INSIDE it, not sections of their own).
 *
 * `data-admin-section-body` names the MOUNTED section for the e2e helpers:
 * the header lozenge repaints synchronously on click, so the attribute is
 * what proves the body actually swapped under it.
 */
export function AdminSectionBody({
  active,
  ctx,
  isLoading,
  lens,
}: {
  active: OrgTabId;
  ctx: OrgViewContext | null;
  isLoading: boolean;
  lens: AnalyticsLens;
}) {
  const { t } = useTranslation("teams");
  return (
    <PageContainer className="pt-6 pb-10" data-admin-section-body={active}>
      {!ctx ? (
        <p className="py-10 text-sm text-ink-muted">
          {isLoading ? t("org.loading") : t("org.unavailable")}
        </p>
      ) : active === "analytics" ? (
        <AnalyticsTab ctx={ctx} lens={lens} />
      ) : (
        <PlainSection active={active} ctx={ctx} />
      )}
    </PageContainer>
  );
}
