import { cn } from "@houston-ai/core";
import { StoreSection, storeSurface, storeType } from "@houston-ai/store";

import {
  AURORA_BACKGROUND,
  AURORA_STOPS,
  EFFECT_DISCLAIMER,
  GLASS_VALUES,
} from "./effects-parts";
import { useThemeName } from "./use-live-theme";

function AuroraPreview({ dark }: { dark: boolean }) {
  return (
    <div
      className="h-32 rounded-xl border border-line bg-gutter"
      style={
        dark
          ? { background: `${AURORA_BACKGROUND}, var(--ht-base)` }
          : undefined
      }
    />
  );
}

function AuroraNote({ dark }: { dark: boolean }) {
  return (
    <p className={cn(storeType.meta, !dark && "font-medium text-ink")}>
      dark only — off in light by design
    </p>
  );
}

function GlassPreview({ dark }: { dark: boolean }) {
  return (
    <div
      className="flex h-32 items-center justify-center rounded-xl border border-line bg-gutter p-4"
      style={
        dark
          ? { background: `${AURORA_BACKGROUND}, var(--ht-base)` }
          : undefined
      }
    >
      <div className={cn(storeSurface.card, "w-full p-4")}>
        <span className={cn(storeType.body, "font-medium")}>Glass card</span>
        <p className={storeType.meta}>bg-card, blurred and lightly saturated</p>
      </div>
    </div>
  );
}

function ValueList({
  items,
}: {
  items: readonly { property: string; value: string; note: string }[];
}) {
  return (
    <dl className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.property} className="flex flex-col gap-0.5">
          <dt className={cn(storeType.body, "font-mono text-[13px]")}>
            {item.property}: {item.value}
          </dt>
          <dd className={storeType.meta}>{item.note}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EffectsSection() {
  const dark = useThemeName() === "dark";
  return (
    <StoreSection
      title="Effects"
      description="Two things the canvas paints that no token controls. Both live in ui/core/src/canvas.css."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className={cn(storeSurface.card, "flex flex-col gap-4")}>
          <div className="flex flex-col gap-1">
            <span className={cn(storeType.body, "font-medium")}>Aurora</span>
            <AuroraNote dark={dark} />
          </div>
          <AuroraPreview dark={dark} />
          <ValueList
            items={AURORA_STOPS.map((stop) => ({
              property: `${stop.tone} · ${stop.where}`,
              value: stop.color,
              note: stop.shape,
            }))}
          />
          <p className={cn(storeType.meta, "mt-auto")}>{EFFECT_DISCLAIMER}</p>
        </div>

        <div className={cn(storeSurface.card, "flex flex-col gap-4")}>
          <div className="flex flex-col gap-1">
            <span className={cn(storeType.body, "font-medium")}>Glass</span>
            <p className={storeType.meta}>
              A card over the aurora: translucent fill, blur behind it, one
              hairline of sheen on top.
            </p>
          </div>
          <GlassPreview dark={dark} />
          <ValueList items={GLASS_VALUES} />
          <p className={cn(storeType.meta, "mt-auto")}>{EFFECT_DISCLAIMER}</p>
        </div>
      </div>
    </StoreSection>
  );
}
