import { LINKEDIN_TEXT_MAX } from "@houston/wire-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@houston-ai/core";
import { Check, Copy, Download } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ShareButton, SharePrimary } from "./org-chart-share-actions";
import { ShareStatusLine } from "./org-chart-share-line";
import { OrgChartSharePreview } from "./org-chart-share-preview";
import type { useOrgChartShare } from "./use-org-chart-share";

/**
 * Share the org chart: the image as it will be posted, the post's words
 * (editable), one primary button (Share on LinkedIn, Connect LinkedIn, Post
 * to LinkedIn or View post, `shareStep`), then Download image and Copy
 * image. One line under them says what happened. The dialog stays open, so
 * the line is still there when the person comes back from LinkedIn.
 *
 * Phone: one column, the picture over the words. Desktop: the picture
 * beside the words, so the portrait image fits without scrolling.
 */
export function OrgChartShareDialog({
  share,
}: {
  share: ReturnType<typeof useOrgChartShare>;
}) {
  const { t } = useTranslation("teams");
  const ready = share.preview.status === "ready";
  const textId = useId();

  return (
    <Dialog open={share.open} onOpenChange={share.setOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("orgChart.share.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("orgChart.share.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6">
          {/* One column below 768px: the picture keeps a phone's width there,
              however wide the dialog's sm: cap lets it grow. */}
          <div className="mx-auto w-full max-w-sm md:max-w-none">
            <OrgChartSharePreview
              preview={share.preview}
              onRetry={share.retry}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <label htmlFor={textId} className="text-sm font-medium text-ink">
              {t("orgChart.share.postLabel")}
            </label>
            <Textarea
              id={textId}
              value={share.text}
              maxLength={LINKEDIN_TEXT_MAX}
              onChange={(event) => share.setText(event.target.value)}
              className="min-h-32 resize-none md:min-h-0 md:flex-1"
            />
            <SharePrimary share={share} />
            <div className="grid grid-cols-2 gap-2">
              <ShareButton
                variant="outline"
                disabled={!ready}
                icon={<Download className="size-4" />}
                label={t("orgChart.share.download")}
                className={share.canCopy ? undefined : "col-span-2"}
                onClick={share.download}
              />
              {share.canCopy && (
                <ShareButton
                  variant="outline"
                  disabled={!ready}
                  icon={
                    share.copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )
                  }
                  label={t(
                    share.copied
                      ? "orgChart.share.copiedImage"
                      : "orgChart.share.copyImage",
                  )}
                  onClick={share.copyImage}
                />
              )}
            </div>
            <ShareStatusLine
              line={share.line}
              onFollowBlocked={share.followBlocked}
              onDismissUnconfirmed={share.dismissUnconfirmed}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
