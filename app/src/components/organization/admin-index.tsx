import { CreditCard, Gauge, History, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { PageContainer, PageHeader } from "../shell/page-shell";
import type { OrgTabId } from "./org-view-model";

interface AdminIndexProps {
  /** The sections visible for this caller + space, from `orgTabIds`. */
  visibleIds: readonly OrgTabId[];
  /** Roster size from the loaded `GET /org`; undefined while it loads. */
  memberCount?: number;
  onSelect: (id: OrgTabId) => void;
}

/**
 * The Admin (Organization) landing index. Settings-page grammar
 * (SettingsCard/SettingsRow): grouped rows with icon + title + one-line
 * description + an at-a-glance value that drill into a detail screen, so a
 * non-technical admin scans membership / insights / billing at a glance instead
 * of reading an anonymous tab strip.
 *
 * Presentational only: the shell owns loading/gating and passes the visible id
 * set plus each row's value. Access CONTROL (who can use which agent, per-agent
 * + org-wide ceilings) lives in the top-level Permissions view now — this
 * dashboard keeps membership + insights + billing. Insights always renders;
 * Billing only when it is in the visible set.
 */
export function AdminIndex({
  visibleIds,
  memberCount,
  onSelect,
}: AdminIndexProps) {
  const { t } = useTranslation("teams");
  const showBilling = visibleIds.includes("billing");

  return (
    <PageContainer className="py-10">
      <PageHeader
        title={t("org.title")}
        subtitle={t("org.subtitle")}
        className="mb-8 px-1"
      />

      <div className="space-y-8">
        <SettingsCard>
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
