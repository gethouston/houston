import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { useAgentStore } from "../../stores/agents";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";
import { BackBarScreen } from "../shell/back-bar-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AgentDetail } from "./agent-detail";
import { AgentsList } from "./agents-list";

/**
 * The Permissions screen (Settings > Permissions, owner/admin only): the ONE
 * place that manages who can do what, and it is FULLY AGENT-CENTRIC. It shows
 * the agent list; open an agent to reach the canonical agent settings page,
 * where WHO can use it, its app + model ceilings, its skills and its context
 * all live in one rail. There is no per-person lens.
 *
 * A shell only: it loads the org once (roster for the list) and owns the
 * drill-in state. Rendered ONLY when `canSeeOrganization` (multiplayer owner/admin,
 * and on a Spaces host a TEAM active space, never the personal one) — the
 * Settings index hides the row and `SettingsView` falls a stale section back to
 * the index for everyone else, so it never mounts in single-player, for a plain
 * member, or in a personal space.
 *
 * A settings section since HOU-788 (it had its own sidebar entry before), so the
 * caller owns the way back out: `onBack`/`backLabel` name the level above, and
 * the agent drill-in reuses the same bar one level down.
 */
export function PermissionsView({
  backLabel,
  onBack,
}: {
  backLabel: string;
  onBack: () => void;
}) {
  const { t } = useTranslation("teams");
  const { data: org } = useOrg(true);
  const agents = useAgentStore((s) => s.agents);

  // Drill-in held as an id (not a snapshot) so a store reload keeps the detail
  // pointed at the live row; if the id drops out, it falls back to the list.
  // The opening section is captured alongside it.
  const [detail, setDetail] = useState<{
    agentId: string;
    section: AgentSettingsSection;
  } | null>(null);

  // Keyed like the global view switches, and reporting the section the page
  // ACTUALLY shows — a request the host hides resolves to a sibling section,
  // and analytics must record where the user landed, not what was asked for.
  const detailAgentId = detail?.agentId;
  const trackSection = useCallback(
    (section: AgentSettingsSection) => {
      if (detailAgentId === undefined) return;
      analytics.track("tab_opened", {
        tab_name: `permissions:${section}`,
        agent_id: detailAgentId,
      });
    },
    [detailAgentId],
  );

  const members = org?.members ?? [];
  const detailAgent =
    detail != null
      ? (agents.find((a) => a.id === detail.agentId) ?? null)
      : null;

  // Agent drill-in: the whole agent settings page. Back returns to the list.
  if (detail && detailAgent) {
    return (
      <BackBarScreen
        backLabel={t("permissions.title")}
        onBack={() => setDetail(null)}
      >
        <AgentDetail
          agent={detailAgent}
          initialSection={detail.section}
          onSectionShown={trackSection}
        />
      </BackBarScreen>
    );
  }

  return (
    <BackBarScreen backLabel={backLabel} onBack={onBack}>
      <PageContainer className="pb-10">
        <PageHeader
          title={t("permissions.title")}
          subtitle={t("permissions.subtitle")}
          className="mb-8 px-1"
        />
        <AgentsList
          members={members}
          onOpenAgent={(a) => setDetail({ agentId: a.id, section: "people" })}
        />
      </PageContainer>
    </BackBarScreen>
  );
}
