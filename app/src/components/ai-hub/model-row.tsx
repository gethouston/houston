/**
 * One ledger row in the models directory, laid out on the shared column grid
 * (`LEDGER_GRID`) so it aligns with the header: Model (brand mark + name + maker),
 * Good at (friendly capability chips), Memory (word + muted mono value), Cost
 * (a budget->premium meter + "from $X"), and how many providers offer it. The
 * whole row is a keyboard-focusable button; nothing is hover-only.
 */

import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { BrandMark } from "./brand-mark.tsx";
import {
  capabilityKeys,
  cheapestInput,
  costTier,
  formatPrice,
  formatTokens,
  labName,
  memoryKey,
} from "./format.ts";
import {
  CapabilityChip,
  CostMeter,
  MemoryLabel,
  PriceText,
} from "./hub-badges.tsx";

/** Shared grid template for the header and every row, so columns line up. */
export const LEDGER_GRID =
  "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_120px_160px_120px] items-center gap-x-4 px-5";

/** Literal i18n keys (kept literal so the typed `t()` accepts them). */
const CAP_KEY = {
  reasoning: "caps.reasoning",
  images: "caps.images",
} as const;
const MEMORY_KEY = {
  standard: "directory.memory.standard",
  long: "directory.memory.long",
  huge: "directory.memory.huge",
} as const;
const TIER_KEY = {
  1: "directory.cost.tiers.1",
  2: "directory.cost.tiers.2",
  3: "directory.cost.tiers.3",
} as const;

export function ModelRow({
  model,
  onOpen,
}: {
  model: CatalogModel;
  onOpen: () => void;
}) {
  const { t } = useTranslation("aiHub");
  const caps = capabilityKeys(model);
  const cheapest = cheapestInput(model.offers);
  const tier = costTier(cheapest);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        LEDGER_GRID,
        "w-full cursor-pointer py-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <BrandMark providerId={model.lab} size="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground text-sm">
            {model.name}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {labName(model.lab)}
          </span>
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1">
        {caps.map((key) => (
          <CapabilityChip key={key} label={t(CAP_KEY[key])} />
        ))}
      </span>

      <span>
        {model.context != null ? (
          <MemoryLabel
            word={t(MEMORY_KEY[memoryKey(model.context)])}
            value={formatTokens(model.context)}
          />
        ) : null}
      </span>

      <span className="flex items-center justify-end gap-2">
        <CostMeter tier={tier} title={t(TIER_KEY[tier])} />
        <PriceText
          text={
            cheapest != null
              ? t("directory.cost.from", { price: formatPrice(cheapest) })
              : t("directory.cost.free")
          }
        />
      </span>

      <span className="text-right text-muted-foreground text-sm tabular-nums">
        {t("directory.providers", { count: model.offers.length })}
      </span>
    </button>
  );
}
