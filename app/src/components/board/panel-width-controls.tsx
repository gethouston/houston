import { ChevronLeft, Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";

export function PanelWidthToggle() {
  const { t } = useTranslation("board");
  const wide = useUIStore((s) => s.chatWide);
  const toggle = useUIStore((s) => s.toggleChatWide);
  const previewing = useUIStore((s) => s.filePreview !== null);
  if (previewing) return null;
  const label = wide ? t("panel.collapse") : t("panel.expand");
  const Icon = wide ? Minimize2 : Maximize2;
  return (
    <button
      type="button"
      data-testid="panel-width-toggle"
      data-state={wide ? "wide" : "side"}
      aria-label={label}
      title={label}
      onClick={toggle}
      className="hidden size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:flex"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

export function PanelBackToBoard({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="panel-back-to-board"
      onClick={onClick}
      className="hidden h-8 shrink-0 items-center gap-1 rounded-full pr-3 pl-2 text-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:flex"
    >
      <ChevronLeft className="size-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}
