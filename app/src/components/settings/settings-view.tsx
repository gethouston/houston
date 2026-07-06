import { Spinner } from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canSeeMembers } from "../../lib/org-roles";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAccountAvailable } from "./sections/account";
import { MembersSection } from "./sections/members";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";
import {
  UserContextSection,
  WorkspaceContextSection,
} from "./sections/workspace-context";
import { SettingsIndex, type SettingsSectionId } from "./settings-index";

export function SettingsView() {
  const { t } = useTranslation(["settings", "common", "org"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const accountAvailable = useAccountAvailable();
  const { capabilities } = useCapabilities();
  const showMembers = canSeeMembers(capabilities);
  const [active, setActive] = useState<SettingsSectionId | null>(null);

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (active === null) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SettingsIndex
          accountAvailable={accountAvailable}
          showMembers={showMembers}
          onSelect={setActive}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 flex-col">
      <div className="shrink-0 px-8 pt-8 pb-2">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t("settings:title")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {active === "workspaceContext" ? (
          <WorkspaceContextSection />
        ) : active === "userContext" ? (
          <UserContextSection />
        ) : (
          <div className="mx-auto max-w-xl px-8 pb-10">
            {active === "members" && <MembersSection />}
            {active === "shortcuts" && <ShortcutsSection />}
            {active === "reportBug" && <ReportBugSection />}
          </div>
        )}
      </div>
    </div>
  );
}
