import { cn } from "@houston-ai/core";
import { EllipsisVertical } from "lucide-react";

const MENU_WIDTH = 160;
export const KEBAB_BUTTON_CLASS =
  "shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** Always-visible row action; reports where its pointer menu should open. */
export function KebabButton({
  label,
  onOpen,
}: {
  label?: string;
  onOpen: (position: { x: number; y: number }) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label ?? "More actions"}
      onClick={(event) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen({ x: Math.max(8, rect.right - MENU_WIDTH), y: rect.bottom + 4 });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(KEBAB_BUTTON_CLASS)}
    >
      <EllipsisVertical aria-hidden className="size-4" />
    </button>
  );
}
