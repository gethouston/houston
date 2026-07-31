/**
 * The Help group that leads the Settings index: the guided tour's entry point,
 * moved here from the agent topbar so the header keeps only the controls people
 * reach for constantly.
 */

import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useUIStore } from "../../stores/ui";
import { SettingsCard, SettingsRow } from "./settings-row";

export function HelpGroup() {
  const { t } = useTranslation("settings");
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setUiTourActive = useUIStore((s) => s.setUiTourActive);

  /**
   * Leave Settings BEFORE arming the tour: every anchor it spotlights lives in
   * the workspace shell, and the overlay measures its first target the moment
   * it mounts. Both writes are synchronous Zustand sets in one handler, so the
   * tour mounts against the already-restored shell, never against Settings.
   */
  function startTour() {
    setViewMode(DEFAULT_TAB_ID);
    setUiTourActive(true);
  }

  return (
    <SettingsCard title={t("settings:index.groups.help")}>
      {/* The wrapper carries the `appTour` anchor the tour's own "replay the
          tour" step spotlights — that step opens Settings to find it. */}
      <div data-tour-target="appTour">
        <SettingsRow
          chevron={false}
          icon={Compass}
          title={t("settings:nav.guideMe")}
          description={t("settings:index.rows.guideMe")}
          testId="settings-row-guide-me"
          onClick={startTour}
        />
      </div>
    </SettingsCard>
  );
}
