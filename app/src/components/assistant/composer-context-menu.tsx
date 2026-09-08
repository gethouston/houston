import { Eraser, FoldVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONTEXT_COMMANDS, type ContextCommandItem } from "./context-commands";

const ICONS: Record<ContextCommandItem["id"], typeof Eraser> = {
  compact: FoldVertical,
  clear: Eraser,
};

interface ComposerContextMenuProps {
  /**
   * False while the conversation has nothing to act on (an empty chat) or a
   * turn is still running. A command sent mid-turn would be held by the send
   * queue and flushed merged with whatever else was queued, which would stop it
   * being the exact text the runtime recognizes.
   */
  enabled: boolean;
  /** Sends the command's text down the normal send path. */
  onCommand: (text: string) => void;
}

/**
 * The composer "+" menu's context entries: compact the conversation now, or
 * start the agent fresh. Rendered under the attachment entries, behind a rule,
 * because they act on the CONVERSATION rather than on the message being
 * written.
 */
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
