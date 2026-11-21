import { CommandGroup, CommandItem, CommandShortcut } from "@houston-ai/core";
import { Keyboard, Plus, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { shortcutLabel } from "../lib/shortcuts";
import { useUIStore } from "../stores/ui";

export function PaletteActions({
  onNewMission,
  onClose,
}: {
  onNewMission: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("shell");
  const openSettings = useUIStore((s) => s.openSettings);
  const setCheatsheetOpen = useUIStore((s) => s.setCheatsheetOpen);

  return (
    <CommandGroup heading={t("palette.groups.actions")}>
      <CommandItem onSelect={onNewMission} value="action new-mission">
        <Plus />
        <span>{t("palette.actions.newMission")}</span>
        <CommandShortcut>{shortcutLabel("newMission")}</CommandShortcut>
      </CommandItem>
      <CommandItem
        onSelect={() => {
          openSettings(null);
          onClose();
        }}
        value="action settings"
      >
        <Settings />
        <span>{t("palette.actions.settings")}</span>
      </CommandItem>
      <CommandItem
        onSelect={() => {
          onClose();
          setTimeout(() => setCheatsheetOpen(true), 30);
        }}
        value="action shortcuts"
      >
        <Keyboard />
        <span>{t("palette.actions.shortcuts")}</span>
        <CommandShortcut>{shortcutLabel("cheatsheet")}</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  );
}
