import { useTranslation } from "react-i18next";
import { Compass, LayoutGrid } from "lucide-react";

import { SetupCard, OptionCard } from "../setup-card";
import { SuccessCheck } from "../success-check";

interface FinishedMissionProps {
  /** Enter the app with the guided tour armed. */
  onTour: () => void;
  /** Enter the app heading for the integrations browser. */
  onConnectMore: () => void;
}

/**
 * Onboarding finished: a quick celebration, then a fork — take the tour of
 * Houston or go connect more integrations. Either way the user lands in the app.
 */
export function FinishedMission({ onTour, onConnectMore }: FinishedMissionProps) {
  const { t } = useTranslation("setup");
  return (
    <SetupCard>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <SuccessCheck size="lg" ring />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("tutorial.missions.finished.title")}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("tutorial.missions.finished.body")}
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <OptionCard
            leading={<Compass className="size-4" />}
            label={t("tutorial.missions.finished.tour")}
            description={t("tutorial.missions.finished.tourBody")}
            selected={false}
            onSelect={onTour}
          />
          <OptionCard
            leading={<LayoutGrid className="size-4" />}
            label={t("tutorial.missions.finished.connectMore")}
            description={t("tutorial.missions.finished.connectMoreBody")}
            selected={false}
            onSelect={onConnectMore}
          />
        </div>
      </div>
    </SetupCard>
  );
}
