import { useTranslation } from "react-i18next";
import {
  headerLozengeClasses,
  headerLozengeTrack,
} from "../shell/page-header/header-lozenge";
import {
  MISSION_FILTER_IDS,
  type MissionFilterId,
} from "./agent-missions-model";

/**
 * The task list's status segments, in the app's own pill grammar (the header
 * lozenge track): All, Needs you, Running, Done.
 *
 * The segments are a NARROWING of the same sectioned list, not four screens:
 * "All" keeps the sections stacked, and picking one leaves only that section
 * standing. Needs you carries its count, because that number is the reason a
 * user came here at all; the other segments carry no badge, so the row does
 * not turn into a scoreboard.
 */
export function AgentMissionsFilter({
  active,
  needsYouCount,
  onSelect,
}: {
  active: MissionFilterId;
  needsYouCount: number;
  onSelect: (filter: MissionFilterId) => void;
}) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const labels: Record<MissionFilterId, string> = {
    all: t("shell:agentsHome.filter.all"),
    needs_you: t("dashboard:columns.needsYou"),
    running: t("dashboard:columns.running"),
    done: t("dashboard:columns.done"),
  };
  return (
    <div
      role="tablist"
      aria-label={t("shell:agentsHome.filter.label")}
      className={headerLozengeTrack("mx-4 mb-1 self-start overflow-x-auto")}
    >
      {MISSION_FILTER_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          data-testid="agent-missions-filter"
          data-filter={id}
          onClick={() => onSelect(id)}
          className={headerLozengeClasses(active === id)}
        >
          {labels[id]}
          {id === "needs_you" && needsYouCount > 0 ? (
            <span className="tabular-nums">{needsYouCount}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
