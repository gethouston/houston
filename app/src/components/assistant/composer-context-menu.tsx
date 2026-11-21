import { Eraser, FoldVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONTEXT_COMMANDS, type ContextCommandItem } from "./context-commands";

const ICONS: Record<ContextCommandItem["id"], typeof Eraser> = {
  compact: FoldVertical,
  clear: Eraser,
};

interface ComposerContextMenuProps {
  enabled: boolean;
  onCommand: (text: string) => void;
}

export function ComposerContextMenu({
  enabled,
  onCommand,
}: ComposerContextMenuProps) {
  const { t } = useTranslation("chat");
  return (
    <>
      <div className="my-1 h-px bg-line/60" />
      {CONTEXT_COMMANDS.map(({ id, text, labelKey }) => {
        const Icon = ICONS[id];
        return (
          <button
            key={id}
            type="button"
            disabled={!enabled}
            onClick={() => onCommand(text)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink hover:bg-hover transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon className="size-4 text-ink-muted" />
            {t(labelKey)}
          </button>
        );
      })}
    </>
  );
}
