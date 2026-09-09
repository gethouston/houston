import { ChevronLeft, Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";

/**
 * The detail panel's own width controls (PRODUCT-1722): a toggle between the
 * side card and the wide chat, and — while wide — the way back to the board
 * the chat is covering. Both render only on desktop: below md the panel is
 * already the whole screen and its close affordances are the way out.
 *
 * They read the ONE persisted preference (`chatWide`, `stores/ui.ts`), so a
 * chat opened next on any opted-in surface comes up the way the user left
 * the last one. Whether the preference takes effect is the SURFACE's call
 * (`useShellDetailPanel({ wide })`): a host that renders the toggle is one
 * that has opted in, so the toggle never promises a layout it can't deliver.
 */
export function PanelWidthToggle() {
  const { t } = useTranslation("board");
  const wide = useUIStore((s) => s.chatWide);
  const toggle = useUIStore((s) => s.toggleChatWide);
  const label = wide ? t("panel.collapse") : t("panel.expand");
  const Icon = wide ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      data-testid="panel-width-toggle"
      data-state={wide ? "wide" : "side"}
      aria-label={label}
      title={label}
      aria-pressed={wide}
      onClick={toggle}
      className="hidden size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus md:flex"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

/**
 * "Back to tasks", leading the wide panel's header: the board is out of the
 * layout, so the chat needs a named way back to it rather than a bare X.
 * Wears the same words the archive's return button does, because it returns
 * to the same place. Closing is the caller's: it must run AIBoard's own
 * closer (the empty new-task composer lives inside AIBoard), not just clear
 * the selection.
 */
export function PanelBackToBoard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("board");
  return (
    <button
      type="button"
      data-testid="panel-back-to-board"
      onClick={onClick}
      className="hidden h-8 shrink-0 items-center gap-1 rounded-full pr-3 pl-2 text-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus md:flex"
    >
      <ChevronLeft className="size-4" strokeWidth={1.75} />
      {t("panel.backToTasks")}
    </button>
  );
}
