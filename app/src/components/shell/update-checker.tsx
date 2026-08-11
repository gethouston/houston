import { useTranslation } from "react-i18next";
import { useUpdateChecker } from "../../hooks/use-update-checker";
import { selectUpdateNotes } from "../../lib/update-details";
import { UpdateForced } from "./update-forced";
import { useUpdateForcedPreview } from "./update-forced-preview";

/**
 * Mounts the update policy and renders the blocking surface when an update was
 * found: UpdateForced (auto-install at launch, countdown mid-session). Updates
 * are forced — there is no dismissible "later" card.
 */
export function UpdateChecker() {
  const { i18n } = useTranslation("shell");
  const { status, forcedMode, installAndRelaunch, relaunchInstalledApp } =
    useUpdateChecker();

  // Dev-only console harness (`__HOUSTON_UPDATE_PREVIEW__`); null in prod.
  const preview = useUpdateForcedPreview();
  if (preview) return <UpdateForced {...preview} />;

  if (status.state === "idle" || !forcedMode) return null;

  // The release ships en/es/pt notes in one updater string; pick the one for
  // the active UI language (which already honors the workspace locale override).
  const notes = selectUpdateNotes(status.info.body, i18n.language);

  return (
    <UpdateForced
      mode={forcedMode}
      status={status}
      notes={notes}
      onInstall={(source) => void installAndRelaunch(source)}
      onRelaunch={() => void relaunchInstalledApp()}
    />
  );
}
