import { Command as CommandPrimitive } from "cmdk";
import { Info, Star } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { HighlightedText } from "../highlighted-text";
import { matchRange } from "./catalog";
import { ModelRowDetail } from "./model-row-detail";
import type {
  ModelPickerLabels,
  ModelPickerModel,
  ModelPickerProvider,
} from "./types";

/** A single selectable model row, with an expandable detail panel. */
export function ModelRow({
  sectionId,
  model,
  provider,
  query,
  selected,
  favorite,
  detailOpen,
  labels,
  onSelect,
  onToggleFavorite,
  onToggleDetail,
  onConnect,
}: {
  /** Owning section id — makes the cmdk `value` unique per (section, model). */
  sectionId: string;
  model: ModelPickerModel;
  provider: ModelPickerProvider | undefined;
  query: string;
  selected: boolean;
  favorite: boolean;
  detailOpen: boolean;
  labels: ModelPickerLabels;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleDetail: (id: string) => void;
  onConnect?: (providerId: string) => void;
}) {
  const disconnected = provider?.connection === "disconnected";
  const range = matchRange(model.name, query);
  return (
    <CommandPrimitive.Item
      value={`${sectionId}:${model.id}`}
      keywords={[model.providerId, provider?.name ?? ""]}
      disabled={disconnected}
      onSelect={() => onSelect(model.id)}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-xl px-3 py-2.5 outline-none",
        "data-[selected=true]:bg-accent",
        selected && "bg-accent",
        disconnected && "cursor-default",
      )}
    >
      {selected && (
        <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-foreground" />
      )}
      <div className="flex items-center gap-3">
        <div className={cn("min-w-0 flex-1", disconnected && "opacity-55")}>
          <div className="truncate text-sm font-semibold text-foreground">
            <HighlightedText
              text={model.name}
              ranges={range ? [range] : undefined}
              markClassName="bg-accent text-foreground"
            />
          </div>
          {model.description && (
            <div className="truncate text-xs text-muted-foreground">
              {model.description}
            </div>
          )}
        </div>
        {disconnected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConnect?.(model.providerId);
            }}
            className="rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            {labels.connect}
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <IconButton
              label={labels.favorites}
              onClick={() => onToggleFavorite(model.id)}
            >
              <Star
                className="size-4"
                fill={favorite ? "currentColor" : "none"}
              />
            </IconButton>
            <IconButton
              label={labels.detailContext}
              onClick={() => onToggleDetail(model.id)}
            >
              <Info className="size-4" />
            </IconButton>
          </div>
        )}
      </div>
      {detailOpen && !disconnected && (
        <ModelRowDetail model={model} labels={labels} />
      )}
    </CommandPrimitive.Item>
  );
}

/** Bare icon button: always visible + muted, gains a subtle neutral bg on hover. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
