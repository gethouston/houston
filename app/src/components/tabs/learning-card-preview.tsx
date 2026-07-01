import { cn } from "@houston-ai/core";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { learningPreviewText } from "../../lib/learning-preview";

export function LearningPreview({
  text,
  expanded,
  canExpand,
  onToggle,
  onEdit,
  onDelete,
}: {
  text: string;
  expanded: boolean;
  canExpand: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation(["agents", "common"]);
  return (
    <div className="flex items-center gap-3">
      {canExpand ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "size-7 shrink-0 rounded-lg flex items-center justify-center",
            "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground",
            "transition-colors",
          )}
          aria-label={
            expanded
              ? t("agents:learnings.collapseAria")
              : t("agents:learnings.expandAria")
          }
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              expanded && "-rotate-180",
            )}
          />
        </button>
      ) : (
        <div className="size-7 shrink-0" />
      )}
      <p
        className={cn(
          "min-w-0 flex-1 text-sm leading-relaxed text-foreground break-words",
          expanded
            ? "whitespace-pre-wrap"
            : "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
        )}
      >
        {expanded || !canExpand ? text : learningPreviewText(text)}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          label={t("agents:learnings.editAria")}
          title={t("common:actions.edit")}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </IconButton>
        {onDelete && (
          <IconButton
            label={t("agents:learnings.removeAria")}
            onClick={onDelete}
            danger
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  title,
  danger,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "size-7 rounded-lg flex items-center justify-center text-muted-foreground",
        "hover:bg-black/[0.04] transition-colors",
        danger ? "hover:text-red-500" : "hover:text-foreground",
      )}
      aria-label={label}
      title={title}
    >
      {children}
    </button>
  );
}
