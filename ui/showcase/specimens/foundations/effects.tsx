import { cn } from "@houston-ai/core";
import { StoreSection, storeSurface, storeType } from "@houston-ai/store";

import {
  AURORA_BACKGROUND,
  AURORA_STOPS,
  EFFECT_DISCLAIMER,
  GLASS_VALUES,
} from "./effects-parts";
import { useThemeName } from "./use-live-theme";

/**
 * The aurora, at postage-stamp size: the same four radial gradients the body
 * paints full-bleed, scaled into a fixed box. Static on purpose — the real one
 * drifts over 32 seconds, which says nothing a still frame does not.
 */
function AuroraPreview({ dark }: { dark: boolean }) {
  return (
    <div
      className="h-32 rounded-xl border border-line bg-gutter"
      // The four layers over the gutter, exactly as the body stacks them:
      // `body` is painted `--ht-base` and `body::before` puts the aurora on
      // top of it. Over a transparent box the mix would read too pale.
      style={
        dark
          ? { background: `${AURORA_BACKGROUND}, var(--ht-base)` }
          : undefined
      }
    />
  );
}

/** The dark-only note, loud in light (where there is nothing else to see). */
function AuroraNote({ dark }: { dark: boolean }) {
  return (
    <p
      className={cn(
        storeType.meta,
        !dark && "font-medium text-ink",
        // The value the box shows in light IS "nothing", so the note is the
        // only content — it has to carry the weight rather than whisper.
      )}
    >
      dark only — off in light by design
    </p>
  );
}

/** The frosted-glass card, shown ON the aurora, which is where it earns its keep. */
function GlassPreview({ dark }: { dark: boolean }) {
  return (
    <div
      className="flex h-32 items-center justify-center rounded-xl border border-line bg-gutter p-4"
      // The four layers over the gutter, exactly as the body stacks them:
      // `body` is painted `--ht-base` and `body::before` puts the aurora on
      // top of it. Over a transparent box the mix would read too pale.
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

/** `property: value` plus one line on why, in the shared meta role. */
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

/**
 * The two effects that make Houston look like Houston but are NOT part of the
 * palette. They are on the colours page because that is where a designer comes
 * looking for them — and they are marked as effects because swapping the
 * palette will not touch either one.
 */
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
              // Tone AND position: two of the four layers are the same blue,
              // and the position is what tells them apart — for the reader and
              // for React's key.
              property: `${stop.tone} · ${stop.where}`,
              value: stop.color,
              note: stop.shape,
            }))}
          />
          {/* Pinned to the foot of the card so the two cards agree, whichever
              one has more values to list. */}
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
          {/* Pinned to the foot of the card so the two cards agree, whichever
              one has more values to list. */}
          <p className={cn(storeType.meta, "mt-auto")}>{EFFECT_DISCLAIMER}</p>
        </div>
      </div>
    </StoreSection>
  );
}
