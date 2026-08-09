import type { SettingsSectionId } from "../../lib/settings-sections";
import { BackBarScreen } from "../shell/back-bar-screen";
import { ApiKeysSection } from "./sections/api-keys";
import { MigrationSection } from "./sections/migration";
import { ProfileSection } from "./sections/profile";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";

interface SettingsSectionBodyProps {
  active: SettingsSectionId;
  /** Names the level the back bar returns to (always the Settings index). */
  backLabel: string;
  onBack: () => void;
}

/**
 * One settings section, mounted on its own screen: a back bar to the index over
 * the reading column, capped at `max-w-xl`. Every remaining section is that one
 * layout — the two self-framed surfaces that needed their own chrome (Admin,
 * Permissions) are top-level views now, not sections.
 */
export function SettingsSectionBody({
  active,
  backLabel,
  onBack,
}: SettingsSectionBodyProps) {
  return (
    <BackBarScreen backLabel={backLabel} onBack={onBack}>
      <div className="mx-auto max-w-xl px-8 pb-10">
        {active === "profile" && <ProfileSection />}
        {/* The API-keys screen is HIDDEN from the index for now (HOU-806: the
            Agents API surface lives in the Routines tab) — its nav row is gone,
            so only a programmatic deep-link pin reaches it. The section and its
            plumbing stay intact for when it returns. */}
        {active === "apiKeys" && <ApiKeysSection />}
        {active === "shortcuts" && <ShortcutsSection />}
        {active === "reportBug" && <ReportBugSection />}
        {active === "migration" && <MigrationSection />}
      </div>
    </BackBarScreen>
  );
}
