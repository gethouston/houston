import { Building2, ChartColumn, CreditCard, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { PageContainer, PageHero } from "../shell/page-shell";
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
 * (SettingsCard/SettingsRow): rows with icon + title + one-line description + an
 * at-a-glance value that drill into a detail screen, so a non-technical admin
 * scans the whole dashboard instead of reading an anonymous tab strip.
 *
 * Four sections: People (the roster and its invites), Billing (the team's plan
 * and seats), Analytics (the activity feed, message usage, and time worked as
 * lenses), and Company context (the standing knowledge every agent in this
 * workspace starts a turn with).
 *
 * Presentational only: the shell owns loading/gating and passes the visible id
 * set plus each row's value. Every row but Billing always renders; Billing only
 * when it is in the visible set. Per-agent policy (who can use which agent, its
 * ceilings) is NOT here — it is reached through each team's Manage agents page.
 */
export function AdminIndex({
  visibleIds,
  memberCount,
  onSelect,
}: AdminIndexProps) {
  const { t } = useTranslation("teams");
  const showBilling = visibleIds.includes("billing");

  return (
    <PageContainer className="pb-10">
      <PageHero
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

        <SettingsCard>
          <SettingsRow
            icon={ChartColumn}
            title={t("org.tabs.analytics")}
            description={t("org.index.rows.analytics")}
            onClick={() => onSelect("analytics")}
          />
          <SettingsRow
            icon={Building2}
            title={t("org.tabs.companyContext")}
            description={t("org.index.rows.companyContext")}
            onClick={() => onSelect("companyContext")}
          />
        </SettingsCard>
      </div>
    </PageContainer>
  );
}
