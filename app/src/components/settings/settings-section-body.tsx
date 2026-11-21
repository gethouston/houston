import { useCapabilities } from "../../hooks/use-capabilities";
import {
  type SettingsSectionId,
  settingsSectionAvailable,
} from "../../lib/settings-sections";
import { BackBarScreen } from "../shell/back-bar-screen";
import { ApiKeysSection } from "./sections/api-keys";
import { ChannelsSection } from "./sections/channels";
import { MigrationSection } from "./sections/migration";
import { MorningBriefingSection } from "./sections/morning-briefing";
import { PlanSection } from "./sections/plan";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";

interface SettingsSectionBodyProps {
  active: SettingsSectionId;
  backLabel: string;
  onBack: () => void;
}

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
        {active === "plan" &&
          settingsSectionAvailable("plan", capabilities) && <PlanSection />}
        {active === "apiKeys" &&
          settingsSectionAvailable("apiKeys", capabilities) && (
            <ApiKeysSection />
          )}
        {active === "channels" && <ChannelsSection />}
        {active === "morningBriefing" &&
          settingsSectionAvailable("morningBriefing", capabilities) && (
            <MorningBriefingSection />
          )}
        {active === "shortcuts" && <ShortcutsSection />}
        {active === "reportBug" && <ReportBugSection />}
        {active === "migration" && <MigrationSection />}
      </div>
    </BackBarScreen>
  );
}
