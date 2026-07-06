import { Command as CommandPrimitive } from "cmdk";
import { Info, Star } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { HighlightedText } from "../highlighted-text";
import { CapabilityIcons } from "./capabilities";
import { matchRange } from "./catalog";
import { ModelRowDetail } from "./model-row-detail";
import { PriceGlyph } from "./price-glyph";
import { ProviderIcon } from "./provider-icon";
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
  renderProviderIcon,
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
  renderProviderIcon?: (id: string, className?: string) => React.ReactNode;
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
        "flex cursor-pointer flex-col rounded-xl px-3 py-2.5 outline-none",
        "data-[selected=true]:bg-accent",
        selected && "bg-accent ring-1 ring-primary/40",
        disconnected && "cursor-default",
      )}
    >
      <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3">
        <ProviderIcon
          providerId={model.providerId}
          name={provider?.name ?? model.providerId}
          render={renderProviderIcon}
          className={cn("size-[30px] rounded-lg", disconnected && "opacity-55")}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-semibold text-foreground",
                disconnected && "opacity-55",
              )}
            >
              <HighlightedText
                text={model.name}
                ranges={range ? [range] : undefined}
              />
            </span>
            <PriceGlyph tier={model.priceTier} freeLabel={labels.free} />
            {model.isNew && (
              <span
                className="rounded px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase"
                style={{
                  color: "var(--ht-warning)",
                  background:
                    "color-mix(in srgb, var(--ht-warning) 14%, transparent)",
                }}
              >
                {labels.new}
              </span>
            )}
            <IconButton
              label={labels.favorites}
              onClick={() => onToggleFavorite(model.id)}
              className="ml-0.5"
            >
              <Star
                className="size-4"
                fill={favorite ? "currentColor" : "none"}
                style={favorite ? { color: "var(--ht-star)" } : undefined}
              />
            </IconButton>
          </div>
          {model.description && (
            <div
              className={cn(
                "truncate text-xs text-muted-foreground",
                disconnected && "opacity-55",
              )}
            >
              {model.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {disconnected ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConnect?.(model.providerId);
              }}
              className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
            >
              {labels.connect}
            </button>
          ) : (
            <>
              <CapabilityIcons
                capabilities={model.capabilities}
                labels={labels}
              />
              <IconButton
                label={labels.detailContext}
                onClick={() => onToggleDetail(model.id)}
                className="size-[26px] rounded-full border border-border"
              >
                <Info className="size-3.5" />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {detailOpen && !disconnected && (
        <ModelRowDetail model={model} labels={labels} />
      )}
    </CommandPrimitive.Item>
  );
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
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
      className={cn(
        "inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
