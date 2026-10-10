import { duration } from "@houston/design-tokens";
import { Button, cn, Skeleton } from "@houston-ai/core";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { ENTRANCE_CURVE, PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
import type { ShareImage } from "./use-share-card-image";

/** Opacity and a 2px blur, over `fast` on the entrance curve. */
const CROSSFADE: CSSProperties = {
  transitionProperty: "opacity, filter",
  transitionDuration: duration.fast,
  transitionTimingFunction: ENTRANCE_CURVE,
};

/**
 * The share image as it will be posted, the dialog's hero. The skeleton and
 * the image share one square frame, so the PNG arriving is a soft crossfade
 * (the image sharpening out of a 2px blur as the skeleton fades) instead of
 * a hard swap. A failed draw says so quietly with a retry.
 */
export function OrgChartSharePreview({
  image,
  onRetry,
}: {
  image: ShareImage;
  onRetry: () => void;
}) {
  const { t } = useTranslation("teams");
  const url = image.status === "ready" ? image.url : null;
  // Keyed to the URL it was set for, so a redraw starts blurred again.
  const [loaded, setLoaded] = useState<string | null>(null);
  const shown = url !== null && loaded === url;

  if (image.status === "failed")
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl bg-chip-subtle p-6 text-center">
        <p className="text-sm text-ink-muted">{t("orgChart.share.failed")}</p>
        <Button
          variant="outline"
          className={cn("rounded-full", PRESS_CLASS)}
          style={PRESS_STYLE}
          onClick={onRetry}
        >
          {t("orgChart.retry")}
        </Button>
      </div>
    );
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl shadow-card ht-hairline">
      <Skeleton
        aria-label={shown ? undefined : t("orgChart.share.drawing")}
        aria-hidden={shown || undefined}
        className={cn(
          "absolute inset-0 size-full rounded-none",
          shown && "animate-none opacity-0",
        )}
        style={CROSSFADE}
      />
      {url && (
        <img
          src={url}
          alt={t("orgChart.share.previewAlt")}
          data-share-preview=""
          onLoad={() => setLoaded(url)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            shown ? "opacity-100 blur-none" : "opacity-0 blur-[2px]",
          )}
          style={CROSSFADE}
        />
      )}
    </div>
  );
}
