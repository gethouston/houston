import type * as React from "react";
import { cn } from "../../utils";
import { CAPABILITY_ICON, capabilityLabel } from "./capabilities";
import { CAPABILITY_ORDER } from "./catalog";
import { contextLevel, PRICE_TIER_DOLLARS } from "./format";
import type { ModelPickerLabels, ModelPickerModel } from "./types";

/**
 * Expanded per-model facts as three compact, icon-forward facets: a context
 * level, a price tier scale, and the capability set. Monochrome throughout —
 * no exact figures, no model id (product decision).
 */
export function ModelRowDetail({
  model,
  labels,
}: {
  model: ModelPickerModel;
  labels: ModelPickerLabels;
}) {
  const level = contextLevel(model.contextWindow);
  const contextWord = [
    labels.contextLow,
    labels.contextMedium,
    labels.contextHigh,
  ][level - 1];
  return (
    <div className="mt-2 flex flex-wrap gap-6 border-t border-dashed border-border pt-3">
      <Facet label={labels.detailContext}>
        <span className="flex items-end gap-[3px]">
          {[1, 2, 3].map((bar) => (
            <span
              key={bar}
              className={cn(
                "w-1 rounded-[1px]",
                bar === 1 ? "h-2" : bar === 2 ? "h-3" : "h-4",
                bar <= level ? "bg-foreground" : "bg-muted-foreground/25",
              )}
            />
          ))}
        </span>
        <span className="text-xs font-medium text-foreground">
          {contextWord}
        </span>
      </Facet>

      <Facet label={labels.price}>
        <PriceScale tier={model.priceTier} freeLabel={labels.free} />
      </Facet>

      <Facet label={labels.detailCapabilities}>
        {CAPABILITY_ORDER.map((cap) => {
          const Icon = CAPABILITY_ICON[cap];
          const on = model.capabilities[cap];
          return (
            <span key={cap} title={capabilityLabel(cap, labels)}>
              <Icon
                className={cn(
                  "size-4",
                  on ? "text-foreground" : "text-muted-foreground/25",
                )}
              />
            </span>
          );
        })}
      </Facet>
    </div>
  );
}

/** `$`/`$$`/`$$$` filled up to the tier, faded remainder — or the free word. */
function PriceScale({
  tier,
  freeLabel,
}: {
  tier: ModelPickerModel["priceTier"];
  freeLabel: string;
}) {
  if (!tier) return <span className="text-xs text-muted-foreground">·</span>;
  if (tier === "free") {
    return (
      <span className="font-mono text-xs font-bold text-foreground">
        {freeLabel}
      </span>
    );
  }
  const filled = PRICE_TIER_DOLLARS[tier];
  return (
    <span className="font-mono text-sm font-bold tabular-nums">
      <span className="text-foreground">{"$".repeat(filled)}</span>
      <span className="text-muted-foreground/30">{"$".repeat(3 - filled)}</span>
    </span>
  );
}

/** One labelled facet: small uppercase label over an icon-forward value row. */
function Facet({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.6rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}
