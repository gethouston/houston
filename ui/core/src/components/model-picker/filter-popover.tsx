import { Filter } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { CAPABILITY_ICON, capabilityLabel } from "./capabilities";
import type { ModelPickerFilterState } from "./catalog";
import { CAPABILITY_ORDER, PRICE_TIER_ORDER } from "./catalog";
import type {
  ModelCapabilityKey,
  ModelPickerLabels,
  ModelPriceTier,
} from "./types";

/** Funnel toggle → popover of capability + price filter chips. */
export function FilterPopover({
  filter,
  labels,
  hasActiveFilter,
  onToggleCap,
  onTogglePriceTier,
  onClear,
}: {
  filter: ModelPickerFilterState;
  labels: ModelPickerLabels;
  hasActiveFilter: boolean;
  onToggleCap: (cap: ModelCapabilityKey) => void;
  onTogglePriceTier: (tier: ModelPriceTier) => void;
  onClear: () => void;
}) {
  const priceLabel: Record<ModelPriceTier, string> = {
    free: labels.priceFree,
    low: labels.priceLow,
    mid: labels.priceMid,
    high: labels.priceHigh,
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={labels.filters}
          aria-label={labels.filters}
          className={cn(
            "relative inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            hasActiveFilter && "bg-accent text-foreground hover:bg-accent",
          )}
        >
          <Filter className="size-4" />
          {hasActiveFilter && (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <Section title={labels.capabilities}>
          {CAPABILITY_ORDER.map((cap) => {
            const Icon = CAPABILITY_ICON[cap];
            return (
              <Chip
                key={cap}
                active={filter.caps.has(cap)}
                onClick={() => onToggleCap(cap)}
              >
                <Icon className="size-3.5" />
                {capabilityLabel(cap, labels)}
              </Chip>
            );
          })}
        </Section>
        <Section title={labels.price}>
          {PRICE_TIER_ORDER.map((tier) => (
            <Chip
              key={tier}
              active={filter.priceTiers.has(tier)}
              onClick={() => onTogglePriceTier(tier)}
            >
              {priceLabel[tier]}
            </Chip>
          ))}
        </Section>
        <button
          type="button"
          onClick={onClear}
          className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {labels.clearFilters}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="mb-2 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        active && "border-foreground/30 bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}
