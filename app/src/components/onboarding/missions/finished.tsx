import { ChevronRight, Compass, LayoutGrid, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCapabilities } from "../../../hooks/use-capabilities";
import { CreateTeamDialog } from "../../shell/create-team-dialog";
import { OptionCard, SetupCard } from "../setup-card";
import { SuccessCheck } from "../success-check";
import { shouldOfferTeamInvite } from "./onboarding-flow";

// These are actions, not a single-select — a chevron reads as "go", where the
// default radio dot would read as a checkbox/option.
const goChevron = <ChevronRight className="size-4 text-muted-foreground" />;

interface FinishedMissionProps {
  /** Enter the app with the guided tour armed. */
  onTour: () => void;
  /** Enter the app heading for the integrations browser. */
  onConnectMore: () => void;
}

/**
 * Onboarding finished: a quick celebration, then a fork — take the tour of
 * Houston, connect more integrations, or (on a spaces host) invite your team.
 * Either way the user lands in the app.
 */
export function FinishedMission({
  onTour,
  onConnectMore,
}: FinishedMissionProps) {
  const { t } = useTranslation("setup");
  const { capabilities } = useCapabilities();
  const [inviteOpen, setInviteOpen] = useState(false);
  const offerInvite = shouldOfferTeamInvite(capabilities);
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
            trailing={goChevron}
            onSelect={onTour}
          />
          <OptionCard
            leading={<LayoutGrid className="size-4" />}
            label={t("tutorial.missions.finished.connectMore")}
            description={t("tutorial.missions.finished.connectMoreBody")}
            selected={false}
            trailing={goChevron}
            onSelect={onConnectMore}
          />
          {offerInvite && (
            <OptionCard
              leading={<Users className="size-4" />}
              label={t("tutorial.missions.finished.inviteTeam")}
              description={t("tutorial.missions.finished.inviteTeamBody")}
              selected={false}
              trailing={goChevron}
              onSelect={() => setInviteOpen(true)}
            />
          )}
        </div>
      </div>
      {offerInvite && (
        <CreateTeamDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
    </SetupCard>
  );
}
