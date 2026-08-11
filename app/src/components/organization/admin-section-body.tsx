import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "../shell/page-shell";
import { ComputeSection } from "../time-worked/compute-section";
import ActivityTab from "./activity-tab";
import BillingTab from "./billing-tab";
import CompanyContextTab from "./company-context-tab";
import MembersTab from "./members-tab";
import type { OrgTabId } from "./org-view-model";
import type { OrgTabProps, OrgViewContext } from "./organization-view";
import UsageTab from "./usage-tab";

/** Each context-backed Organization section renders from the shared contract. */
const SECTION_COMPONENTS: Record<
  Exclude<OrgTabId, "timeWorked">,
  (props: OrgTabProps) => ReactNode
> = {
  people: MembersTab,
  billing: BillingTab,
  companyContext: CompanyContextTab,
  activity: ActivityTab,
  usage: UsageTab,
};

/** Mounts the record's component AS a component, so its hooks stay its own. */
function PlainSection({
  active,
  ctx,
}: {
  active: Exclude<OrgTabId, "timeWorked">;
  ctx: OrgViewContext;
}) {
  const Section = SECTION_COMPONENTS[active];
  return <Section ctx={ctx} />;
}

/**
 * The active section's body under the Admin strip. No heading of its own: the
 * header's lozenge already names the section (the shared grammar with
 * Integrations and the team screen), so a hero here would say it twice. Every
 * context-backed section renders from the shared `{ ctx }` contract. Time
 * worked has no need for organization context and renders directly.
 *
 * `data-admin-section-body` names the MOUNTED section for the e2e helpers:
 * the header lozenge repaints synchronously on click, so the attribute is
 * what proves the body actually swapped under it.
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
  return (
    <PageContainer
      // Company context is a pinned page (its editor card owns the bottom
      // gap), so its container is a height-bounded column with no bottom
      // padding of its own; every other section pads and scrolls normally.
      className={
        active === "companyContext"
          ? "flex h-full min-h-0 flex-col pt-6"
          : "pt-6 pb-10"
      }
      data-admin-section-body={active}
    >
      {!ctx ? (
        <p className="py-10 text-sm text-ink-muted">
          {isLoading ? t("org.loading") : t("org.unavailable")}
        </p>
      ) : active === "timeWorked" ? (
        <ComputeSection />
      ) : (
        <PlainSection active={active} ctx={ctx} />
      )}
    </PageContainer>
  );
}
