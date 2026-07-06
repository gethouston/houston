import {
  AGENT_COLORS,
  agentColorId,
  Button,
  ConfirmDialog,
  cn,
  colorValue,
} from "@houston-ai/core";
import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_COLOR_LABEL_KEYS } from "../shell/agent-sidebar-color-menu";
import { canSaveName } from "./agent-settings-model";

/**
 * The "General" sub-tab of an agent's Agent Settings tab (tab id
 * `job-description`). Surfaces the same actions as the sidebar card's
 * three-dots menu (rename, color, share, delete) as a full settings panel
 * instead of a dropdown.
 */
export function AgentSettingsContent({
  name,
  color,
  onRename,
  onChangeColor,
  onShare,
  onDelete,
  canEdit = true,
}: {
  name: string;
  color: string | undefined;
  onRename: (name: string) => Promise<unknown>;
  onChangeColor: (color: string) => Promise<unknown>;
  onShare: () => void;
  onDelete: () => Promise<unknown>;
  /**
   * Whether the caller may reconfigure the agent (matrix v2: agent-manager).
   * When false the rename field is locked, the color swatches are disabled, and
   * the danger/delete section is hidden — rename + delete are manager-scope on
   * the wire. Defaults to true so single-player is unchanged.
   */
  canEdit?: boolean;
}) {
  const { t } = useTranslation(["agents", "shell", "common", "portable"]);
  const [draftName, setDraftName] = useState(name);
  const [showConfirm, setShowConfirm] = useState(false);
  const selectedColor = agentColorId(color);

  // Keep the field in sync when the rename lands (the store re-selects the
  // agent with its new, on-disk name) or the user switches agents.
  useEffect(() => {
    setDraftName(name);
  }, [name]);

  const handleRename = async () => {
    if (!canSaveName(name, draftName)) {
      setDraftName(name);
      return;
    }
    try {
      await onRename(draftName.trim());
    } catch {
      // The store/tauri layer already surfaced the reason as a toast (e.g. a
      // name clash). Restore the field to the agent's real name so the input
      // doesn't keep showing the rejected text.
      setDraftName(name);
    }
  };

  const handleConfirmDelete = async () => {
    setShowConfirm(false);
    await onDelete();
  };

  return (
    <div className="mx-auto max-w-xl px-8 py-10 space-y-10">
      <section>
        <h2 className="text-lg font-semibold mb-4">
          {t("agents:agentSettings.nameTitle")}
        </h2>
        <label
          htmlFor="agent-settings-name"
          className="text-xs text-muted-foreground block mb-1.5"
        >
          {t("agents:agentSettings.nameLabel")}
        </label>
        <input
          id="agent-settings-name"
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => void handleRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
          }}
          readOnly={!canEdit}
          placeholder={t("agents:agentSettings.namePlaceholder")}
          className={cn(
            "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-ring transition-all",
            !canEdit && "cursor-default text-muted-foreground",
          )}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">
          {t("agents:agentSettings.colorTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("agents:agentSettings.colorHelper")}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {AGENT_COLORS.map((entry) => {
            const isActive = entry.id === selectedColor;
            const label = t(
              AGENT_COLOR_LABEL_KEYS[entry.id] ??
                "shell:sidebar.colorLabels.charcoal",
            );
            return (
              <button
                key={entry.id}
                type="button"
                aria-label={label}
                aria-pressed={isActive}
                title={label}
                disabled={!canEdit}
                onClick={() => void onChangeColor(entry.id)}
                className={cn(
                  "size-7 rounded-full transition-transform",
                  "ring-offset-2 ring-offset-background",
                  canEdit ? "hover:scale-110" : "cursor-default opacity-60",
                  isActive && "ring-2 ring-ring",
                )}
                style={{ backgroundColor: colorValue(entry) }}
              />
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">
          {t("agents:agentSettings.shareTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("agents:agentSettings.shareHelper")}
        </p>
        <Button variant="secondary" className="rounded-full" onClick={onShare}>
          <Share2 className="size-4" />
          {t("portable:shareMenu")}
        </Button>
      </section>

      {canEdit && (
        <section>
          <h2 className="text-lg font-semibold text-destructive mb-1">
            {t("agents:agentSettings.dangerTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("agents:agentSettings.dangerHelper")}
          </p>
          <Button
            variant="destructive"
            className="rounded-full"
            onClick={() => setShowConfirm(true)}
          >
            {t("common:actions.delete")}
          </Button>
        </section>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t("shell:agentDelete.title")}
        description={t("shell:agentDelete.description")}
        confirmLabel={t("common:actions.delete")}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
