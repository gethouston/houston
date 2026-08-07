import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent } from "../../lib/types";
import {
  type AgentSettingsSection,
  agentSettingsGroups,
} from "./agent-settings-nav.ts";
import { AgentSettingsRail } from "./agent-settings-rail.tsx";
import { AgentSettingsSectionView } from "./agent-settings-section.tsx";
import {
  advanceAgentSettingsSelection,
  resolveAgentSettingsSection,
} from "./agent-settings-selection.ts";

/**
 * The ONE canonical agent settings page: everything an admin configures on a
 * single agent, as a master-detail surface — the grouped rail on the left
 * (Context, Permissions), the selected section on the right. One section is
 * always selected, so the page has no back navigation of its own; the caller
 * owns the way out.
 *
 * Mounted today as the Settings > Permissions agent drill-in and, later, as the
 * drill-in of the Team Settings surface. It carries NO authority of its own:
 * `readOnly` is the caller's decision, the gateway is the sole enforcer, and
 * the rail's visibility rules are the caps-only ones in
 * {@link agentSettingsGroups}.
 */
export function AgentSettingsPage({
  agent,
  initialSection,
  readOnly = false,
  onSectionShown,
}: {
  agent: Agent;
  /** Section to open on first mount (a deep link may land on Apps). */
  initialSection?: AgentSettingsSection;
  /** View-only: every section renders its non-manager face. */
  readOnly?: boolean;
  /** The section actually ON SCREEN, for the caller's analytics. */
  onSectionShown?: (section: AgentSettingsSection) => void;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const groups = useMemo(
    () => agentSettingsGroups(capabilities),
    [capabilities],
  );
  const [selected, setSelected] = useState<AgentSettingsSection>(() =>
    resolveAgentSettingsSection(groups, initialSection),
  );
  // The request is RETAINED until a rail that can show it honors it once:
  // `/v1/capabilities` lands after the first render, and a re-fired deep link
  // for the agent already on screen must reopen its section too.
  const pendingRef = useRef<AgentSettingsSection | undefined>(initialSection);
  const requestRef = useRef({ agentId: agent.id, section: initialSection });
  // Mirrors `selected` so the resolve effect reads the live section without
  // re-running on every rail click (and without a side effect in an updater).
  const selectedRef = useRef(selected);
  const select = useCallback((section: AgentSettingsSection) => {
    selectedRef.current = section;
    setSelected(section);
  }, []);

  useEffect(() => {
    const request = requestRef.current;
    if (request.agentId !== agent.id || request.section !== initialSection) {
      requestRef.current = { agentId: agent.id, section: initialSection };
      pendingRef.current = initialSection;
    }
    const next = advanceAgentSettingsSelection({
      groups,
      pending: pendingRef.current,
      current: selectedRef.current,
    });
    pendingRef.current = next.pending;
    if (next.selected !== selectedRef.current) select(next.selected);
  }, [agent.id, groups, initialSection, select]);

  useEffect(() => {
    onSectionShown?.(selected);
  }, [selected, onSectionShown]);

  return (
    <div className="flex items-start">
      <AgentSettingsRail
        agent={agent}
        groups={groups}
        ariaLabel={t("agentSettings.railLabel")}
        selected={selected}
        onSelect={select}
      />
      <div className="min-w-0 flex-1 pl-6">
        <AgentSettingsSectionView
          agent={agent}
          section={selected}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
