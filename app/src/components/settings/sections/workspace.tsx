import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { isMultiplayer } from "../../../lib/org-roles";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

export function WorkspaceSection() {
  const { t } = useTranslation("settings");
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const renameWorkspace = useWorkspaceStore((s) => s.rename);
  const addToast = useUIStore((s) => s.addToast);
  const { capabilities } = useCapabilities();
  const [wsName, setWsName] = useState("");

  useEffect(() => {
    setWsName(currentWorkspace?.name ?? "");
  }, [currentWorkspace?.name]);

  if (!currentWorkspace) return null;
  // Individual users keep the fixed "Personal" workspace — renaming is an
  // org-only affordance (the workspace name IS the organization's name).
  if (!isMultiplayer(capabilities)) return null;

  const handleRename = async () => {
    const trimmed = wsName.trim();
    if (trimmed && trimmed !== currentWorkspace.name) {
      await renameWorkspace(currentWorkspace.id, trimmed);
      addToast({ title: t("toasts.workspaceRenamed") });
    }
  };

  return (
    <SettingsControlRow icon={Settings} title={t("workspace.title")}>
      <input
        aria-label={t("workspace.title")}
        type="text"
        value={wsName}
        onChange={(e) => setWsName(e.target.value)}
        onBlur={handleRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-52 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none transition-all focus:ring-1 focus:ring-ring"
      />
    </SettingsControlRow>
  );
}
