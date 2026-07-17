import type { Agent, OrgMember } from "@houston-ai/engine-client";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer, PageHeader } from "../shell/page-shell";
import ActivityTab from "./activity-tab";
import AgentsTab from "./agents-tab";
import AllowedIntegrationsTab from "./allowed-integrations-tab";
import AllowedModelsTab from "./allowed-models-tab";
import BillingTab from "./billing-tab";
import MembersTab from "./members-tab";
import type { OrgTabId } from "./org-view-model";
import type { OrgTabProps, OrgViewContext } from "./organization-view";
import UsageTab from "./usage-tab";

// Agents and People are off this map on purpose: each takes an extra drill-in
// prop (`onOpenAgent` / `onOpenMember`) that the generic `{ ctx }` contract
// can't carry, so this component renders them explicitly. Every OTHER section
// stays on the generic path.
const SECTION_COMPONENTS: Record<
  Exclude<OrgTabId, "agents" | "people">,
  (props: OrgTabProps) => ReactNode
> = {
  activity: ActivityTab,
  usage: UsageTab,
  allowedIntegrations: AllowedIntegrationsTab,
  allowedModels: AllowedModelsTab,
  billing: BillingTab,
};

/**
 * A section's detail body inside the Admin dashboard: the section heading over
 * its content. Agents and People carry a drill-in callback the shell wires to
 * its `detail*Id` state; every other section renders from the shared `{ ctx }`
 * contract. Extracted from `organization-view.tsx` so the shell stays a thin
 * index/detail/drill-in switch.
 */
export function AdminSectionDetail({
  active,
  ctx,
  isLoading,
  onOpenAgent,
  onOpenMember,
}: {
  active: OrgTabId;
  ctx: OrgViewContext | null;
  isLoading: boolean;
  onOpenAgent: (agent: Agent) => void;
  onOpenMember: (member: OrgMember) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <PageContainer className="pb-10">
      <PageHeader title={t(`org.tabs.${active}`)} className="mb-6" />
      {ctx ? (
        active === "agents" ? (
          <AgentsTab ctx={ctx} onOpenAgent={onOpenAgent} />
        ) : active === "people" ? (
          <MembersTab ctx={ctx} onOpenMember={onOpenMember} />
        ) : (
          renderSection(active, ctx)
        )
      ) : (
        <p className="py-10 text-sm text-ink-muted">
          {isLoading ? t("org.loading") : t("org.unavailable")}
        </p>
      )}
    </PageContainer>
  );
}

/** Render a generic (non-drill-in) section from its shared `{ ctx }` contract. */
function renderSection(
  id: Exclude<OrgTabId, "agents" | "people">,
  ctx: OrgViewContext,
) {
  const Section = SECTION_COMPONENTS[id];
  return <Section ctx={ctx} />;
}
