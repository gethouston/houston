import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@houston-ai/core";
import { Check, Copy, Download, Linkedin, Share2 } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { sharePostText } from "./org-chart-share-model";
import { OrgChartSharePreview } from "./org-chart-share-preview";
import type { OrgTree } from "./org-chart-tree";
import { useOrgChartShareActions } from "./use-org-chart-share-actions";
import { useSeedOnOpen } from "./use-seed-on-open";
import { useShareCardImage } from "./use-share-card-image";

/**
 * Share the org chart: the drawn image, the post to go with it (editable,
 * prefilled every time the dialog opens), and the ways out. LinkedIn's
 * share link carries text only, so "Share on LinkedIn" copies the post and
 * opens the composer, and the dialog says to attach the downloaded image.
 * Copy image and the native share sheet appear only where the browser can
 * do them; the share sheet hands the image to the LinkedIn app directly.
 */
export function OrgChartShareDialog({
  tree,
  open,
  onOpenChange,
}: {
  tree: OrgTree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("teams");
  const postId = useId();
  const { image, retry } = useShareCardImage(tree, open);
  const [post, setPost] = useSeedOnOpen(open, () => sharePostText(t, tree));
  const actions = useOrgChartShareActions(tree, image, post);
  const imageReady = image.status === "ready";
  const doneIcon = <Check className="size-4" />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[min(48rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("orgChart.share.title")}</DialogTitle>
          <DialogDescription>
            {t("orgChart.share.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-6">
          <OrgChartSharePreview image={image} onRetry={retry} />
          <div className="flex min-w-0 flex-col gap-3">
            <label htmlFor={postId} className="text-sm font-medium text-ink">
              {t("orgChart.share.postLabel")}
            </label>
            <Textarea
              id={postId}
              value={post}
              onChange={(event) => setPost(event.target.value)}
              rows={7}
              className="min-h-40 text-base md:min-h-48"
            />
            <p className="text-xs text-ink-muted">
              {t("orgChart.share.linkedInHint")}
            </p>
            {actions.blockedUrl && (
              <p className="text-sm text-ink" role="status">
                {t("orgChart.share.linkedInBlocked")}{" "}
                <a
                  href={actions.blockedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-link underline underline-offset-2"
                >
                  {t("orgChart.share.openLinkedIn")}
                </a>
              </p>
            )}
            <div className="mt-1 flex flex-col gap-2 md:flex-row md:flex-wrap">
              <Button
                className="rounded-full"
                onClick={() => void actions.linkedIn()}
              >
                <Linkedin className="size-4" />
                {t("orgChart.share.linkedIn")}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!imageReady}
                onClick={() => void actions.download()}
              >
                {actions.done === "download" ? (
                  doneIcon
                ) : (
                  <Download className="size-4" />
                )}
                {t(
                  actions.done === "download"
                    ? "orgChart.share.downloaded"
                    : "orgChart.share.download",
                )}
              </Button>
              {actions.abilities.copyImage && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={!imageReady}
                  onClick={() => void actions.copyImage()}
                >
                  {actions.done === "copy_image" ? (
                    doneIcon
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {t(
                    actions.done === "copy_image"
                      ? "orgChart.share.copied"
                      : "orgChart.share.copyImage",
                  )}
                </Button>
              )}
              {actions.abilities.nativeShare && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void actions.nativeShare()}
                >
                  <Share2 className="size-4" />
                  {t("orgChart.share.native")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
