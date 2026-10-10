import { Button, Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ShareImage } from "./use-share-card-image";

/**
 * The share image as it will be posted: a square skeleton while it draws,
 * the PNG once drawn, and a quiet line with a retry if the draw failed.
 */
export function OrgChartSharePreview({
  image,
  onRetry,
}: {
  image: ShareImage;
  onRetry: () => void;
}) {
  const { t } = useTranslation("teams");
  if (image.status === "ready")
    return (
      <img
        src={image.url}
        alt={t("orgChart.share.previewAlt")}
        data-share-preview=""
        className="aspect-square w-full rounded-xl object-cover ht-hairline"
      />
    );
  if (image.status === "drawing")
    return (
      <Skeleton
        aria-label={t("orgChart.share.drawing")}
        className="aspect-square w-full rounded-xl"
      />
    );
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl bg-chip-subtle p-6 text-center">
      <p className="text-sm text-ink-muted">{t("orgChart.share.failed")}</p>
      <Button variant="outline" className="rounded-full" onClick={onRetry}>
        {t("orgChart.retry")}
      </Button>
    </div>
  );
}
