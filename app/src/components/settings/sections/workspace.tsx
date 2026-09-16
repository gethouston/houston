import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

/**
 * The workspace's name, for a caller who does not administer the space.
 *
 * READ-ONLY on purpose: renaming a workspace has no route behind it, so the
 * field that used to sit here toasted success over a name the host never
 * stored. Whoever may rename the space renames it in Admin, which is the face
 * this section wears for them.
 */
export function WorkspaceSection() {
  const { t } = useTranslation("settings");
  const currentWorkspace = useWorkspaceStore((s) => s.current);

  if (!currentWorkspace) return null;

  return (
    <SettingsControlRow icon={Settings} title={t("workspace.title")}>
      <span className="truncate text-sm text-ink-muted">
        {currentWorkspace.name}
      </span>
    </SettingsControlRow>
  );
}
