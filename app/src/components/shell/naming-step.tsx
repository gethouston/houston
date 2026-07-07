import {
  AGENT_COLORS,
  Button,
  cn,
  colorValue,
  DialogTitle,
  HoustonAvatar,
  Input,
  resolveAgentColor,
  Spinner,
} from "@houston-ai/core";
import { ArrowLeft, Check, FolderOpen } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { localizeCatalogCopy } from "../../agents/catalog-labels";
import type { AgentDefinition } from "../../lib/types";

interface NamingStepProps {
  selectedAgent: AgentDefinition | undefined;
  name: string;
  color: string | undefined;
  error: string | null;
  existingPath: string | null;
  /** The create request is in flight — lock the submit and show progress. */
  creating: boolean;
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
  name,
  color,
  error,
  existingPath,
  creating,
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
  const selectedName = selectedAgent
    ? localizeCatalogCopy(selectedAgent.config, t).name
    : t("naming.newAgentFallback");

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, [color, onColorChange]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <button
        type="button"
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("naming.dialogTitle")}</DialogTitle>

      {/* Avatar preview */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <HoustonAvatar color={resolvedColor} diameter={80} />

        <div className="text-center">
          <p className="text-lg font-semibold">{selectedName}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("naming.tagline")}
          </p>
        </div>
      </div>

      {/* Color palette */}
      <div className="flex items-center gap-2 mb-6">
        {AGENT_COLORS.map((c) => {
          const swatch = colorValue(c);
          const isSelected =
            color === c.id || color === c.light || color === c.dark;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onColorChange(c.id)}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150",
                isSelected
                  ? "ring-2 ring-offset-2 ring-foreground/30"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: swatch }}
            >
              {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          );
        })}
      </div>

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
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-full px-3 py-1.5">
                <FolderOpen className="size-3" />
                <span className="truncate max-w-[200px]">
                  {existingPath.split("/").pop()}
                </span>
                <button
                  type="button"
                  onClick={() => onExistingPathChange(null)}
                  className="text-muted-foreground hover:text-foreground ml-1"
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
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <FolderOpen className="size-3" />
                {t("naming.linkExistingProject")}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
        <Button
          type="submit"
          disabled={!name.trim() || creating}
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
  );
}
