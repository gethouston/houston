import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { AgentAdminInstructions } from "../agent/agent-admin/agent-admin-instructions";
import { AgentAdminIntegrations } from "../agent/agent-admin/agent-admin-integrations";
import { AgentAdminKnowledge } from "../agent/agent-admin/agent-admin-knowledge";
import { AgentAdminModel } from "../agent/agent-admin/agent-admin-model";
import { AgentAdminSkills } from "../agent/agent-admin/agent-admin-skills";
import { OrgLockedFieldset, OrgLockedNote } from "../shell/org-locked-fieldset";
import { PageHero } from "../shell/page-shell";
import { AgentDelegationSection } from "./agent-delegation-section.tsx";
import { AgentSettingsManage } from "./agent-settings-manage.tsx";
import type {
  AgentSectionProps,
  AgentSettingsSection,
} from "./agent-settings-nav.ts";
import { AgentSettingsPeople } from "./agent-settings-people.tsx";

function AccessColumn({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-12">
      <OrgLockedFieldset>{children}</OrgLockedFieldset>
    </div>
  );
}

function HeroAccessColumn({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: (titleId: string) => ReactNode;
}) {
  const titleId = useId();
  return (
    <AccessColumn>
      <PageHero
        level={2}
        titleId={titleId}
        className="mb-4"
        title={title}
        subtitle={subtitle}
      />
      {children(titleId)}
    </AccessColumn>
  );
}

export function AgentSettingsSectionView({
  agent,
  section,
}: AgentSectionProps & { section: AgentSettingsSection }) {
  const { t } = useTranslation("teams");
  switch (section) {
    case "job-description":
      return (
        <AccessColumn>
          <AgentAdminInstructions agent={agent} />
        </AccessColumn>
      );
    case "learnings":
      return <AgentAdminKnowledge agent={agent} />;
    case "people":
      return (
        <AccessColumn>
          <AgentSettingsPeople agent={agent} />
        </AccessColumn>
      );
    case "integrations":
      return (
        <HeroAccessColumn
          title={t("agentAdmin.heroes.integrations")}
          subtitle={t("integrations.allowlist.question")}
        >
          {(titleId) => (
            <AgentAdminIntegrations agent={agent} labelledBy={titleId} />
          )}
        </HeroAccessColumn>
      );
    case "models":
      return (
        <HeroAccessColumn
          title={t("agentAdmin.heroes.models")}
          subtitle={t("agentAdmin.models.question")}
        >
          {(titleId) => <AgentAdminModel agent={agent} labelledBy={titleId} />}
        </HeroAccessColumn>
      );
    case "skills":
      return <AgentAdminSkills agent={agent} />;
    case "delegation":
      return (
        <AccessColumn>
          <AgentDelegationSection agent={agent} />
        </AccessColumn>
      );
    case "manage":
      return (
        <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-12">
          <OrgLockedNote />
          <AgentSettingsManage agent={agent} />
        </div>
      );
  }
}
