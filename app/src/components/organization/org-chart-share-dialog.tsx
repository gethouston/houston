import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@houston-ai/core";
import { Check, Copy, Download, Linkedin, Share2 } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { PRESS_CLASS, PRESS_STYLE } from "./org-chart-motion";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[min(56rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("orgChart.share.title")}</DialogTitle>
          <DialogDescription>
            {t("orgChart.share.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] md:gap-8">
          <OrgChartSharePreview image={image} onRetry={retry} />
          <div className="flex min-w-0 flex-col gap-4">
            <ShareButton
              icon={<Linkedin className="size-4" />}
              label={t("orgChart.share.linkedIn")}
              className="h-10 w-full"
              onClick={() => void actions.linkedIn()}
            />
            <p className="-mt-1 text-xs text-pretty text-ink-muted">
              {t("orgChart.share.linkedInHint")}
            </p>
            {actions.blockedUrl && (
              <p className="-mt-1 text-sm text-ink" role="status">
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
            <div className="flex flex-wrap gap-2">
              <ShareButton
                variant="outline"
                disabled={!imageReady}
                done={actions.done === "download"}
                icon={<Download className="size-4" />}
                label={t(
                  actions.done === "download"
                    ? "orgChart.share.downloaded"
                    : "orgChart.share.download",
                )}
                onClick={() => void actions.download()}
              />
              {actions.abilities.copyImage && (
                <ShareButton
                  variant="outline"
                  disabled={!imageReady}
                  done={actions.done === "copy_image"}
                  icon={<Copy className="size-4" />}
                  label={t(
                    actions.done === "copy_image"
                      ? "orgChart.share.copied"
                      : "orgChart.share.copyImage",
                  )}
                  onClick={() => void actions.copyImage()}
                />
              )}
              {actions.abilities.nativeShare && (
                <ShareButton
                  variant="outline"
                  icon={<Share2 className="size-4" />}
                  label={t("orgChart.share.native")}
                  onClick={() => void actions.nativeShare()}
                />
              )}
            </div>
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
              <label htmlFor={postId} className="text-xs text-ink-muted">
                {t("orgChart.share.postLabel")}
              </label>
              <Textarea
                id={postId}
                value={post}
                onChange={(event) => setPost(event.target.value)}
                rows={7}
                className="min-h-40 text-base"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A pill that presses in, and trades its icon for a check once done. */
function ShareButton({
  icon,
  label,
  done = false,
  className,
  ...props
}: {
  icon: ReactNode;
  label: string;
  done?: boolean;
} & ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn("rounded-full", PRESS_CLASS, className)}
      style={PRESS_STYLE}
      {...props}
    >
      {done ? <Check className="size-4" /> : icon}
      {label}
    </Button>
  );
}
