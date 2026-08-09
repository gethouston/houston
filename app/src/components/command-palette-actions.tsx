/**
 * The command palette's Actions group: the handful of destinations that are
 * always reachable, whatever the workspace holds. Split out of
 * `command-palette.tsx`, which keeps the dialog and the data-backed lists.
 *
 * Starting a mission is the one action with real routing behind it, so it
 * arrives as a prop; the rest are plain store navigations and read the store
 * here rather than travelling as five more props.
 */

import { CommandGroup, CommandItem, CommandShortcut } from "@houston-ai/core";
import { Inbox, Keyboard, Plus, Settings, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { shortcutLabel } from "../lib/shortcuts";
import { INBOX_VIEW_ID } from "../lib/top-level-views";
import { useUIStore } from "../stores/ui";
import { STORE_VIEW_ID } from "./store-view";

export function PaletteActions({
  onNewMission,
  onClose,
}: {
  onNewMission: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("shell");
  const setViewMode = useUIStore((s) => s.setViewMode);
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
          setViewMode(INBOX_VIEW_ID);
          onClose();
        }}
        value="action inbox"
      >
        <Inbox />
        <span>{t("palette.actions.inbox")}</span>
        <CommandShortcut>{shortcutLabel("inbox")}</CommandShortcut>
      </CommandItem>
      <CommandItem
        onSelect={() => {
          setViewMode(STORE_VIEW_ID);
          onClose();
        }}
        value="action agent-store"
      >
        <Store />
        <span>{t("sidebar.agentStore")}</span>
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
