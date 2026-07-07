import { AsyncButton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { WizardFrame } from "./wizard-frame";

/**
 * The wizard's opening offer: what we found on this computer, one primary
 * action to bring it along, and an explicit "start fresh" that persists the
 * decline (the user keeps working without the old data).
 */
export function OfferScreen({
  detection,
  onStart,
  onSkip,
}: {
  detection: LegacyDetection;
  onStart: () => Promise<void> | void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("migration");
  const agents = t("offer.foundAgents", {
    count: detection.agentDirCount,
  });
  const workspaces = t("offer.foundWorkspaces", {
    count: detection.workspaceDirs.length,
  });
  const found = detection.hasChatDb
    ? t("offer.foundWithHistory", { agents, workspaces })
    : t("offer.found", { agents, workspaces });

  return (
    <WizardFrame
      title={t("offer.title")}
      body={t("offer.body")}
      footer={
        <>
          <AsyncButton className="rounded-full px-6" onClick={() => onStart()}>
            {t("offer.start")}
          </AsyncButton>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("offer.startFresh")}
          </button>
          <p className="text-xs text-muted-foreground">
            {t("offer.startFreshHint")}
          </p>
        </>
      }
    >
      <div className="rounded-xl bg-secondary p-4 text-center">
        <p className="text-sm text-foreground">{found}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("offer.timeNote")}
        </p>
      </div>
    </WizardFrame>
  );
}
