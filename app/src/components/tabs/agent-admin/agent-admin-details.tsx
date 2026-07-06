import {
  AGENT_COLORS,
  agentColorId,
  Button,
  ConfirmDialog,
  cn,
  colorValue,
} from "@houston-ai/core";
import { Palette, Trash2, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";
import { useAgentStore } from "../../../stores/agents";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsCard, SettingsControlRow } from "../../settings/settings-row";
import { AGENT_COLOR_LABEL_KEYS } from "../../shell/agent-sidebar-color-menu";
import { canSaveName } from "../agent-settings-model";

/**
 * The agent's name / color / delete, rendered as inline control rows in a
 * "General"-titled {@link SettingsCard} at the bottom of the Agent Settings
 * landing (it is a card, not a navigable screen). Mirrors the sidebar Settings inline
 * pattern (WorkspaceSection / AppearanceSection / DangerSection): a settings
 * entry resolved in place, not a navigable drill-in. Only managers / owners (or
 * the single-player sole user) reach this tab, so it is always editable; the
 * gateway is the real enforcer.
 */
export function AgentAdminDetails({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["agents", "shell", "common", "teams"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);

  const [draftName, setDraftName] = useState(agent.name);
  const [showConfirm, setShowConfirm] = useState(false);
  const selectedColor = agentColorId(agent.color);

  // Re-sync when the rename lands (the store re-selects the agent under its new
  // on-disk name) or the user switches agents.
  useEffect(() => {
    setDraftName(agent.name);
  }, [agent.name]);

  const handleRename = async () => {
    if (!canSaveName(agent.name, draftName)) {
      setDraftName(agent.name);
      return;
    }
    if (!currentWorkspace) return;
    try {
      await renameAgent(currentWorkspace.id, agent.id, draftName.trim());
    } catch {
      // The store/tauri layer already toasted the reason (e.g. a name clash);
      // restore the field to the agent's real name.
      setDraftName(agent.name);
    }
  };

  const handleDelete = async () => {
    setShowConfirm(false);
    if (currentWorkspace) await deleteAgent(currentWorkspace.id, agent.id);
  };

  return (
    <SettingsCard title={t("teams:agentAdmin.groups.general")}>
      <SettingsControlRow
        icon={Type}
        title={t("agents:agentSettings.nameTitle")}
      >
        <input
          aria-label={t("agents:agentSettings.nameTitle")}
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => void handleRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder={t("agents:agentSettings.namePlaceholder")}
          className="w-52 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none transition-all focus:ring-1 focus:ring-ring"
        />
      </SettingsControlRow>

      <SettingsControlRow
        icon={Palette}
        title={t("agents:agentSettings.colorTitle")}
        description={t("agents:agentSettings.colorHelper")}
      >
        <div className="flex flex-wrap justify-end gap-2">
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
                onClick={() =>
                  currentWorkspace &&
                  void updateAgentColor(currentWorkspace.id, agent.id, entry.id)
                }
                className={cn(
                  "size-6 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                  isActive && "ring-2 ring-ring",
                )}
                style={{ backgroundColor: colorValue(entry) }}
              />
            );
          })}
        </div>
      </SettingsControlRow>

      <SettingsControlRow
        icon={Trash2}
        title={t("agents:agentSettings.dangerTitle")}
        description={t("agents:agentSettings.dangerHelper")}
        destructive
      >
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowConfirm(true)}
        >
          {t("common:actions.delete")}
        </Button>
      </SettingsControlRow>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t("shell:agentDelete.title")}
        description={t("shell:agentDelete.description")}
        confirmLabel={t("common:actions.delete")}
        onConfirm={() => void handleDelete()}
      />
    </SettingsCard>
  );
}
