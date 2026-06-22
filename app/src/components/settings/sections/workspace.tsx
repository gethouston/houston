import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { useUIStore } from "../../../stores/ui";

export function WorkspaceSection() {
  const { t } = useTranslation("settings");
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const renameWorkspace = useWorkspaceStore((s) => s.rename);
  const addToast = useUIStore((s) => s.addToast);
  const [wsName, setWsName] = useState("");

  useEffect(() => {
    setWsName(currentWorkspace?.name ?? "");
  }, [currentWorkspace?.name]);

  if (!currentWorkspace) return null;

  const handleRename = async () => {
    const trimmed = wsName.trim();
    if (trimmed && trimmed !== currentWorkspace.name) {
      await renameWorkspace(currentWorkspace.id, trimmed);
      addToast({ title: t("toasts.workspaceRenamed") });
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">{t("workspace.title")}</h2>
      <div>
        <label
          htmlFor="workspace-name"
          className="text-xs text-muted-foreground block mb-1.5"
        >
          {t("workspace.nameLabel")}
        </label>
        <input
          id="workspace-name"
          type="text"
          value={wsName}
          onChange={(e) => setWsName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
          }}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-ring transition-all"
        />
      </div>
    </section>
  );
}
