import { useCapabilities } from "../../hooks/use-capabilities";
import {
  type SettingsSectionId,
  settingsSectionAvailable,
} from "../../lib/settings-sections";
import { BackBarScreen } from "../shell/back-bar-screen";
import { AboutMeSection } from "./sections/about-me";
import { ApiKeysSection } from "./sections/api-keys";
import { ChannelsSection } from "./sections/channels";
import { MigrationSection } from "./sections/migration";
import { PlanSection } from "./sections/plan";
import { ProfileSection } from "./sections/profile";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";

interface SettingsSectionBodyProps {
  active: SettingsSectionId;
  /** Names the level the way back returns to (always the Settings index). */
  backLabel: string;
  onBack: () => void;
}

/**
 * One settings section, mounted on its own screen: a back bar to the index over
 * the reading column, capped at `max-w-xl` (Plan's comparison takes
 * `max-w-4xl`).
 */
export function SettingsSectionBody({
  active,
  backLabel,
  onBack,
}: SettingsSectionBodyProps) {
  const { capabilities } = useCapabilities();

  return (
    <BackBarScreen backLabel={backLabel} onBack={onBack}>
      <div
        className={`mx-auto px-4 pb-10 md:px-8 ${active === "plan" ? "max-w-4xl" : "max-w-xl"}`}
      >
        {active === "profile" && <ProfileSection />}
        {active === "plan" &&
          settingsSectionAvailable("plan", capabilities) && <PlanSection />}
        {active === "aboutMe" && <AboutMeSection />}
        {/* The API-keys screen is HIDDEN from the index for now (HOU-806: the
            Agents API surface lives in the Routines tab) — its nav row is gone,
            so only a programmatic deep-link pin reaches it. The section and its
            plumbing stay intact for when it returns. */}
        {active === "apiKeys" && <ApiKeysSection />}
        {active === "channels" && <ChannelsSection />}
        {active === "shortcuts" && <ShortcutsSection />}
        {active === "reportBug" && <ReportBugSection />}
        {active === "migration" && <MigrationSection />}
      </div>
    </BackBarScreen>
  );
}
