import type { ReactNode } from "react";
import { PageContainer } from "../shell/page-shell";
import ActivityTab from "./activity-tab";
import BillingTab from "./billing-tab";
import MembersTab from "./members-tab";
import OrgChartTab from "./org-chart-tab";
import type { OrgTabId } from "./org-view-model";
import type { OrgTabProps, OrgViewContext } from "./organization-view";

const SECTION_COMPONENTS: Record<OrgTabId, (props: OrgTabProps) => ReactNode> =
  {
    orgChart: OrgChartTab,
    people: MembersTab,
    billing: BillingTab,
    activity: ActivityTab,
  };

function PlainSection({
  active,
  ctx,
}: {
  active: OrgTabId;
  ctx: OrgViewContext;
}) {
  const Section = SECTION_COMPONENTS[active];
  return <Section ctx={ctx} />;
}

export function AdminSectionBody({
  active,
  ctx,
}: {
  active: OrgTabId;
  ctx: OrgViewContext;
}) {
  return (
    <PageContainer
      className={
        active === "orgChart" ? "max-w-368 pt-6 pb-10 md:pt-10" : "pt-6 pb-10"
      }
      data-admin-section-body={active}
    >
      <PlainSection active={active} ctx={ctx} />
    </PageContainer>
  );
}
