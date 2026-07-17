import {
  Blocks,
  Bot,
  Boxes,
  CreditCard,
  Gauge,
  History,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { PageContainer, PageHeader } from "../shell/page-shell";
import type { OrgTabId } from "./org-view-model";

interface AdminIndexProps {
  /** The sections visible for this caller + space, from `orgTabIds`. */
  visibleIds: readonly OrgTabId[];
  /** Roster size from the loaded `GET /org`; undefined while it loads. */
  memberCount?: number;
  /** Agents the caller can see, from the agent store. */
  agentCount: number;
  /** Org app ceiling: `null` = all apps, `string[]` = allowlist, undefined = loading. */
  allowedToolkits: string[] | null | undefined;
  /** Org model ceiling: `null` = all models, `string[]` = allowlist, undefined = loading. */
  allowedModels: string[] | null | undefined;
  onSelect: (id: OrgTabId) => void;
}

/**
 * The Admin (Organization) landing index. Rebuilt in the settings-page grammar
 * (SettingsCard/SettingsRow): grouped rows with icon + title + one-line
 * description + an at-a-glance value that drill into a detail screen. The old
 * flat text-tab strip read as an anonymous label row; non-technical admins
 * could not tell People from Usage at a glance, so every section is now a
 * self-describing, scannable row.
 *
 * Presentational only: the shell owns loading/gating and passes the visible id
 * set plus each row's value. The PERMISSIONS card is the admin home for access
 * control — People (who can use which agents), Agents (each agent's access +
 * integration/model ceilings), and, on a Teams host, the two org-wide ceilings.
 * Insights always renders; Billing only when it is in the visible set.
 */
export function AdminIndex({
  visibleIds,
  memberCount,
  agentCount,
  allowedToolkits,
  allowedModels,
  onSelect,
}: AdminIndexProps) {
  const { t } = useTranslation("teams");
  const showAccess = visibleIds.includes("allowedIntegrations");
  const showBilling = visibleIds.includes("billing");

  // `null` ceiling = every app/model allowed; an array = an allowlist of that
  // size; undefined = the org-settings query is still loading, so show no value
  // rather than a premature "0 allowed".
  const appsValue =
    allowedToolkits === undefined
      ? undefined
      : allowedToolkits === null
        ? t("org.index.values.allApps")
        : t("org.index.values.appsAllowed", { count: allowedToolkits.length });
  const modelsValue =
    allowedModels === undefined
      ? undefined
      : allowedModels === null
        ? t("org.index.values.allModels")
        : t("org.index.values.modelsAllowed", { count: allowedModels.length });

  return (
    <PageContainer className="py-10">
      <PageHeader
        title={t("org.title")}
        subtitle={t("org.subtitle")}
        className="mb-8 px-1"
      />

      <div className="space-y-8">
        <SettingsCard title={t("org.index.groups.permissions")}>
          <SettingsRow
            icon={Users}
            title={t("org.tabs.people")}
            description={t("org.index.rows.people")}
            value={
              memberCount === undefined
                ? undefined
                : t("org.index.values.members", { count: memberCount })
            }
            onClick={() => onSelect("people")}
          />
          <SettingsRow
            icon={Bot}
            title={t("org.tabs.agents")}
            description={t("org.index.rows.agents")}
            value={t("org.index.values.agents", { count: agentCount })}
            onClick={() => onSelect("agents")}
          />
          {showAccess && (
            <>
              <SettingsRow
                icon={Blocks}
                title={t("org.tabs.allowedIntegrations")}
                description={t("org.index.rows.allowedIntegrations")}
                value={appsValue}
                onClick={() => onSelect("allowedIntegrations")}
              />
              <SettingsRow
                icon={Boxes}
                title={t("org.tabs.allowedModels")}
                description={t("org.index.rows.allowedModels")}
                value={modelsValue}
                onClick={() => onSelect("allowedModels")}
              />
            </>
          )}
        </SettingsCard>

        <SettingsCard title={t("org.index.groups.insights")}>
          <SettingsRow
            icon={History}
            title={t("org.tabs.activity")}
            description={t("org.index.rows.activity")}
            onClick={() => onSelect("activity")}
          />
          <SettingsRow
            icon={Gauge}
            title={t("org.tabs.usage")}
            description={t("org.index.rows.usage")}
            onClick={() => onSelect("usage")}
          />
        </SettingsCard>

        {showBilling && (
          <SettingsCard>
            <SettingsRow
              icon={CreditCard}
              title={t("org.tabs.billing")}
              description={t("org.index.rows.billing")}
              onClick={() => onSelect("billing")}
            />
          </SettingsCard>
        )}
      </div>
    </PageContainer>
  );
}
