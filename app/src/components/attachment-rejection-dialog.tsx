import type { AttachmentRejection, PrepareAttachments } from "@houston-ai/chat";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { AlertTriangle } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ComposerAttachmentPolicy,
  type ComposerAttachmentRejectReason,
  formatBytes,
  splitComposerAttachments,
} from "../lib/attachment-validation";

interface AttachmentValidationDialogApi {
  prepareAttachments: PrepareAttachments;
  onAttachmentRejections: (rejections: AttachmentRejection[]) => void;
  dialog: ReactNode;
}

export function useAttachmentRejectionDialog(
  policy?: ComposerAttachmentPolicy,
): AttachmentValidationDialogApi {
  const { t } = useTranslation("chat");
  const [rejections, setRejections] = useState<AttachmentRejection[]>([]);
  const open = rejections.length > 0;
  const close = useCallback(() => setRejections([]), []);

  // Keyed on the policy VALUE (not the object identity) so callers may build
  // the policy inline without re-creating prepareAttachments every render.
  const modelAcceptsImages = policy?.modelAcceptsImages;
  const prepareAttachments = useCallback<PrepareAttachments>(
    (incoming) => {
      const result = splitComposerAttachments(incoming, { modelAcceptsImages });
      return {
        accepted: result.accepted,
        rejected: result.rejected.map((rejection) => ({
          file: rejection.file,
          reason: formatReason(rejection.reason, t),
        })),
      };
    },
    [t, modelAcceptsImages],
  );

  const onAttachmentRejections = useCallback(
    (next: AttachmentRejection[]) => setRejections(next),
    [],
  );

  const dialog = useMemo(
    () => (
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <DialogTitle>{t("attachmentIssues.title")}</DialogTitle>
                <DialogDescription className="mt-1">
                  {t("attachmentIssues.description")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-md border bg-chip-subtle/25">
            {rejections.map((rejection) => (
              <div
                key={`${rejection.file.name}-${rejection.file.size}`}
                className="border-b px-3 py-2 last:border-b-0"
              >
                <div className="truncate text-sm font-medium text-ink">
                  {rejection.file.name}
                </div>
                <div className="text-xs text-ink-muted">{rejection.reason}</div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={close}>{t("attachmentIssues.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    [close, open, rejections, t],
  );

  return { prepareAttachments, onAttachmentRejections, dialog };
}

function formatReason(
  reason: ComposerAttachmentRejectReason,
  t: ReturnType<typeof useTranslation<"chat">>["t"],
): string {
  if (reason.kind === "tooLarge") {
    return t("attachmentIssues.reasons.tooLarge", {
      maxSize: formatBytes(reason.maxBytes),
    });
  }
  if (reason.kind === "modelCannotViewImages") {
    return t("attachmentIssues.reasons.modelCannotViewImages");
  }
  if (reason.extension) {
    return t("attachmentIssues.reasons.blockedTypeWithExtension", {
      extension: reason.extension,
    });
  }
  return t("attachmentIssues.reasons.blockedType");
}
