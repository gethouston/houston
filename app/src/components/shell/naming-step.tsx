import {
  AGENT_COLORS,
  Button,
  DialogTitle,
  HoustonAvatar,
  Input,
  resolveAgentColor,
  Spinner,
} from "@houston-ai/core";
import { ArrowLeft, FolderOpen } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { localizeCatalogCopy } from "../../agents/catalog-labels";
import type { AgentDefinition } from "../../lib/types";
import { tutorialAnchor } from "../tutorial";
import { AgentColorPalette } from "./agent-color-palette";

interface NamingStepProps {
  selectedAgent: AgentDefinition | undefined;
  /** Replaces the catalog name above the avatar (the copy path names its source). */
  heading?: string;
  name: string;
  color: string | undefined;
  error: string | null;
  existingPath: string | null;
  /** The create request is in flight — lock the submit and show progress. */
  creating: boolean;
  /** The typed name fails pre-submit validation — lock the submit. */
  nameInvalid?: boolean;
  /** Show "Link existing project" option (opt-in via agent features). */
  showLinkProject?: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onExistingPathChange: (path: string | null) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function NamingStep({
  selectedAgent,
  heading,
  name,
  color,
  error,
  existingPath,
  creating,
  nameInvalid,
  onNameChange,
  onColorChange,
  onExistingPathChange,
  showLinkProject,
  onBack,
  onSubmit,
}: NamingStepProps) {
  const { t } = useTranslation(["shell", "agents"]);
  // Default to white on mount if none selected
  const resolvedColor = resolveAgentColor(color);
  const selectedName =
    heading ??
    (selectedAgent
      ? localizeCatalogCopy(selectedAgent.config, t).name
      : t("naming.newAgentFallback"));

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, [color, onColorChange]);

  return (
    // Scrolls when taller than the dialog (a phone, keyboard up), centered by
    // auto margins so a fitting column still sits in the middle on desktop.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-10 md:px-6 md:py-16">
      <button
        type="button"
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-ink-muted hover:bg-hover hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("naming.dialogTitle")}</DialogTitle>

      <div className="m-auto flex w-full flex-col items-center">
        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <HoustonAvatar color={resolvedColor} diameter={80} />

          <div className="text-center">
            <p className="text-lg font-semibold">{selectedName}</p>
            <p className="text-sm text-ink-muted mt-1">{t("naming.tagline")}</p>
          </div>
        </div>

        {/* Color palette + form: ONE anchored block, so the tutorial's ring
          wraps exactly what "pick a color and give it a name" means and its
          chip can sit in the modal's side whitespace instead of on the copy. */}
        <div
          {...tutorialAnchor("createAgentNaming")}
          className="flex w-full flex-col items-center"
        >
          <AgentColorPalette color={color} onColorChange={onColorChange} />

          <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t("naming.namePlaceholder")}
              className="text-center rounded-full"
            />

            {/* Link existing project — opt-in via agent features */}
            {showLinkProject && (
              <div className="flex flex-col items-center gap-1.5">
                {existingPath ? (
                  <div className="flex items-center gap-2 text-xs text-ink-muted bg-chip rounded-full px-3 py-1.5">
                    <FolderOpen className="size-3" />
                    <span className="truncate max-w-[200px]">
                      {existingPath.split("/").pop()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onExistingPathChange(null)}
                      className="text-ink-muted hover:text-ink ml-1"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const { tauriAgents } = await import("../../lib/tauri");
                      const picked = await tauriAgents.pickDirectory();
                      if (picked) {
                        onExistingPathChange(picked);
                        if (!name.trim()) {
                          const folderName =
                            picked.replace(/\/$/, "").split("/").pop() ?? "";
                          onNameChange(folderName);
                        }
                      }
                    }}
                    className="text-xs text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="size-3" />
                    {t("naming.linkExistingProject")}
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-danger text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={!name.trim() || nameInvalid || creating}
              className="w-full rounded-full"
            >
              {creating ? (
                <>
                  <Spinner className="size-4" />
                  {t("naming.createAgent")}
                </>
              ) : (
                t("naming.createAgent")
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
