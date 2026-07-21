import { useTranslation } from "react-i18next";
import { useUpdateChecker } from "../../hooks/use-update-checker";
import { isHostedGatewayEngine } from "../../lib/engine";
import { selectUpdateNotes } from "../../lib/update-details";
import { UpdateForced } from "./update-forced";
import { useUpdateForcedPreview } from "./update-forced-preview";
import { UpdateRequired } from "./update-required";

/**
 * Mounts the update policy and renders whichever blocking surface applies.
 * Updates are forced — there is no dismissible "later" card:
 *
 * 1. Gateway hard floor tripped (hosted builds) → UpdateRequired. Scoped to
 *    hosted-gateway builds: on a local/sidecar build every feature is served
 *    by the co-located host (the gateway is never on the request path), so
 *    even a stray floor signal must not lock the user out of local work.
 * 2. An update was found → UpdateForced (auto-install at launch, countdown
 *    mid-session).
 */
export function UpdateChecker() {
  const { i18n } = useTranslation("shell");
  const {
    status,
    required,
    forcedMode,
    installAndRelaunch,
    relaunchInstalledApp,
  } = useUpdateChecker();

  // Dev-only console harness (`__HOUSTON_UPDATE_PREVIEW__`); null in prod.
  const preview = useUpdateForcedPreview();
  if (preview) return <UpdateForced {...preview} />;

  if (required && isHostedGatewayEngine()) {
    return (
      <UpdateRequired
        required={required}
        status={status}
        onInstall={() => void installAndRelaunch("user")}
        onRelaunch={() => void relaunchInstalledApp()}
      />
    );
  }

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
