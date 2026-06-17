import { useTranslation } from "react-i18next";

import { HoustonLogo } from "../../shell/experience-card";
import { SetupCard } from "../setup-card";

interface IntroMissionProps {
  /** Advance into the first setup step (log in to the AI subscription). */
  onContinue: () => void;
}

/**
 * Unnumbered framing screen that opens the setup phase. Sets the expectation
 * ("a couple of quick steps") so the AI + apps steps read as one coherent
 * "set up your account" block, distinct from creating the first agent after.
 */
export function IntroMission({ onContinue }: IntroMissionProps) {
  const { t } = useTranslation("setup");
  return (
    <SetupCard
      title={t("tutorial.missions.intro.title")}
      subtitle={t("tutorial.missions.intro.body")}
      onNext={onContinue}
      nextLabel={t("tutorial.missions.intro.cta")}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <HoustonLogo size={64} />
      </div>
    </SetupCard>
  );
}
