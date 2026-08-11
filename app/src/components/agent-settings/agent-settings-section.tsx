import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { AgentAdminInstructions } from "../agent/agent-admin/agent-admin-instructions";
import { AgentAdminIntegrations } from "../agent/agent-admin/agent-admin-integrations";
import { AgentAdminKnowledge } from "../agent/agent-admin/agent-admin-knowledge";
import { AgentAdminModel } from "../agent/agent-admin/agent-admin-model";
import { AgentAdminSkills } from "../agent/agent-admin/agent-admin-skills";
import { PageHero } from "../shell/page-shell";
import { AgentSettingsManage } from "./agent-settings-manage.tsx";
import type {
  AgentSectionProps,
  AgentSettingsSection,
} from "./agent-settings-nav.ts";
import { AgentSettingsPeople } from "./agent-settings-people.tsx";

/**
 * The flush bodies (job description, people, apps, models) deliberately own no
 * width of their own, so the mounting surface does. This gives them the SAME
 * column the one self-padded body (learnings) brings — `max-w-3xl px-6` on one
 * `pt-2` top rhythm — so nothing shifts as the rail switches sections.
 */
function AccessColumn({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-12">{children}</div>
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

/** The same column, height-bounded: for a body that PINS a document card to
 *  the window's bottom gap (job description) instead of page-scrolling. */
function FillColumn({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-6 pt-2">
      {children}
    </div>
  );
}

/**
 * The ONE section switch: renders the section the rail selected into the right
 * pane. Every branch COMPOSES the existing section component rather than
 * re-implementing it, so no two surfaces can drift.
 */
export function AgentSettingsSectionView({
  agent,
  section,
}: AgentSectionProps & { section: AgentSettingsSection }) {
  const { t } = useTranslation("teams");
  switch (section) {
    case "job-description":
      return (
        <FillColumn>
          <AgentAdminInstructions agent={agent} />
        </FillColumn>
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
    case "manage":
      return (
        <AccessColumn>
          <AgentSettingsManage agent={agent} />
        </AccessColumn>
      );
  }
}
