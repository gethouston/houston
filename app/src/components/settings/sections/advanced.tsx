import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, FolderOpen } from "lucide-react";
import { Button } from "@houston-ai/core";
import { useUIStore } from "../../../stores/ui";
import { useDeveloperMode } from "../../../hooks/use-developer-mode";
import {
  osGetDocsRoot,
  osPickDirectory,
  osRevealPath,
  osSetDocsRoot,
} from "../../../lib/os-bridge";

/**
 * Advanced settings. Houston is invisible-substrate by default; the developer
 * mode toggle reveals the technical surfaces (files, git, the workspace-root
 * location) for power users. Lives in the Workspace settings tab.
 */
export function AdvancedSection() {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const { enabled, setEnabled } = useDeveloperMode();
  const [docsRoot, setDocsRoot] = useState<string>("");

  useEffect(() => {
    osGetDocsRoot()
      .then(setDocsRoot)
      .catch((err) =>
        addToast({
          title: t("advanced.workspaceLocation.loadFailed"),
          description: err instanceof Error ? err.message : String(err),
          variant: "error",
        }),
      );
  }, []);

  const handleToggle = async () => {
    try {
      await setEnabled(!enabled);
    } catch (err) {
      addToast({
        title: t("advanced.toggleFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  const handleChangeLocation = async () => {
    try {
      const picked = await osPickDirectory();
      if (!picked) return;
      await osSetDocsRoot(picked);
      setDocsRoot(picked);
      addToast({
        title: t("advanced.workspaceLocation.changed"),
        description: t("advanced.workspaceLocation.restartHint"),
      });
    } catch (err) {
      addToast({
        title: t("advanced.workspaceLocation.changeFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">{t("advanced.title")}</h2>

      {/* Developer mode toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Code2 className="size-4" />
            {t("advanced.developerMode.label")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("advanced.developerMode.description")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("advanced.developerMode.label")}
          onClick={handleToggle}
          className={`mt-1 h-6 w-10 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-secondary"
          }`}
        >
          <span
            className={`block size-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Workspace location — only meaningful in developer mode */}
      {enabled && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <FolderOpen className="size-4" />
            {t("advanced.workspaceLocation.label")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("advanced.workspaceLocation.description")}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => docsRoot && void osRevealPath(docsRoot)}
              title={docsRoot}
              className="min-w-0 flex-1 truncate rounded-lg border border-border bg-secondary/50 px-3 py-2 text-left font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {docsRoot || "…"}
            </button>
            <Button
              className="shrink-0 rounded-full"
              onClick={handleChangeLocation}
            >
              {t("advanced.workspaceLocation.change")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
