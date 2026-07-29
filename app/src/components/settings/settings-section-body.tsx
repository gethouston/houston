import type { SettingsSectionId } from "../../lib/settings-sections";
import { OrganizationView } from "../organization";
import { PermissionsView } from "../permissions";
import { BackBarScreen } from "../shell/back-bar-screen";
import { TimeWorkedView } from "../time-worked";
import { ApiKeysSection } from "./sections/api-keys";
import { MigrationSection } from "./sections/migration";
import { ProfileSection } from "./sections/profile";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";
import {
  UserContextSection,
  WorkspaceContextSection,
} from "./sections/workspace-context";

interface SettingsSectionBodyProps {
  active: SettingsSectionId;
  /** Names the level the back bar returns to (always the Settings index). */
  backLabel: string;
  onBack: () => void;
}

/**
 * One settings section, mounted on its own screen. Three layouts:
 *
 * - SELF-FRAMED (Time worked, Permissions, Admin — HOU-788): whole surfaces that
 *   own their internal drill-ins, so they render their OWN back bar and get
 *   `backLabel`/`onBack` handed in. Wrapping them here would stack two bars.
 * - FULL WIDTH (the context editors): the editor fills the scroll region.
 * - READING COLUMN (everything else): capped at `max-w-xl`.
 */
export function SettingsSectionBody({
  active,
  backLabel,
  onBack,
}: SettingsSectionBodyProps) {
  if (active === "timeWorked")
    return <TimeWorkedView backLabel={backLabel} onBack={onBack} />;
  if (active === "permissions")
    return <PermissionsView backLabel={backLabel} onBack={onBack} />;
  if (active === "organization")
    return <OrganizationView backLabel={backLabel} onBack={onBack} />;

  return (
    <BackBarScreen backLabel={backLabel} onBack={onBack}>
      {active === "workspaceContext" ? (
        <WorkspaceContextSection />
      ) : active === "userContext" ? (
        <UserContextSection />
      ) : (
        <div className="mx-auto max-w-xl px-8 pb-10">
          {active === "profile" && <ProfileSection />}
          {/* The API-keys screen is HIDDEN from the index for now (HOU-806:
              the Agents API surface lives in the Routines tab) — its nav row
              is gone, so only a programmatic deep-link pin reaches it. The
              section and its plumbing stay intact for when it returns. */}
          {active === "apiKeys" && <ApiKeysSection />}
          {active === "shortcuts" && <ShortcutsSection />}
          {active === "reportBug" && <ReportBugSection />}
          {active === "migration" && <MigrationSection />}
        </div>
      )}
    </BackBarScreen>
  );
}
