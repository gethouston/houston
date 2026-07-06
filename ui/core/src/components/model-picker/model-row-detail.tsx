import { capabilityLabel } from "./capabilities";
import { CAPABILITY_ORDER } from "./catalog";
import { formatContext, formatPricePerMtok } from "./format";
import type { ModelPickerLabels, ModelPickerModel } from "./types";

/**
 * Expanded per-model facts. This is the ONLY place exact $/Mtok pricing shows
 * (the row carries just a tier glyph, per the product decision).
 */
export function ModelRowDetail({
  model,
  labels,
}: {
  model: ModelPickerModel;
  labels: ModelPickerLabels;
}) {
  const caps =
    CAPABILITY_ORDER.filter((c) => model.capabilities[c])
      .map((c) => capabilityLabel(c, labels))
      .join(" · ") || "·";
  return (
    <div className="mt-2 flex flex-wrap gap-4 border-t border-dashed border-border pt-3">
      <Stat k={labels.detailContext} v={formatContext(model.contextWindow)} />
      <Stat
        k={labels.detailInput}
        v={formatPricePerMtok(model.priceInPerMtok, labels.free)}
      />
      <Stat
        k={labels.detailOutput}
        v={formatPricePerMtok(model.priceOutPerMtok, labels.free)}
      />
      <Stat k={labels.detailCapabilities} v={caps} />
      <Stat k={labels.detailModelId} v={model.id} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.6rem] tracking-wider text-muted-foreground uppercase">
        {k}
      </span>
      <span className="font-mono text-xs font-semibold text-foreground">
        {v}
      </span>
    </div>
  );
}
