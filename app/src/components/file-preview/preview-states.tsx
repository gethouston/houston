import { Button, FileTypeGlyphInline } from "@houston-ai/core";
import { Download, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isPresentation } from "./citation-labels";

export function isPagedFile(fileName: string, converts: boolean): boolean {
  return converts || /\.pdf$/i.test(fileName);
}

export function PreviewSkeleton({
  fileName,
  paged,
  label,
}: {
  fileName: string;
  paged: boolean;
  label: string;
}) {
  const ratio = isPresentation(fileName) ? "16 / 9" : "1 / 1.414";
  return (
    <div
      role="status"
      aria-label={label}
      className="min-h-0 flex-1 overflow-hidden bg-gutter px-4 py-4 md:px-6 md:py-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 md:gap-5">
        {paged ? (
          [0, 1, 2].map((i) => (
            <div
              key={i}
              className="pdf-page pdf-page-skeleton w-full"
              style={{ aspectRatio: ratio }}
            />
          ))
        ) : (
          <div className="pdf-page pdf-page-skeleton h-64 w-full" />
        )}
      </div>
    </div>
  );
}

export type FallbackKind = "failed" | "unsupported" | "error";

export function PreviewFallback({
  kind,
  fileName,
  message,
  canDownload,
  onDownload,
  onRetry,
}: {
  kind: FallbackKind;
  fileName: string;
  message?: string;
  canDownload: boolean;
  onDownload: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("agents");
  const extension = fileName.split(".").pop() ?? "";
  const copy =
    kind === "failed"
      ? {
          title: t("files.preview.failedTitle"),
          body: isPresentation(fileName)
            ? t("files.preview.failedDeck")
            : t("files.preview.failedBody"),
        }
      : kind === "unsupported"
        ? {
            title: t("files.preview.unsupportedTitle"),
            body: t("files.preview.unsupportedDescription"),
          }
        : { title: t("files.preview.errorTitle"), body: message ?? "" };
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto bg-gutter p-6">
      <div className="flex max-w-90 flex-col items-center gap-2 text-center">
        <span className="mb-2 grid size-14 place-items-center rounded-2xl bg-card-solid shadow-card ring-1 ring-line">
          <FileTypeGlyphInline extension={extension} className="size-6" />
        </span>
        <h3 className="text-base font-semibold text-balance text-ink">
          {copy.title}
        </h3>
        {copy.body && (
          <p className="mb-3 text-sm text-pretty break-words text-hover-text">
            {copy.body}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {canDownload && (
            <Button
              type="button"
              onClick={onDownload}
              className="preview-press rounded-full"
            >
              <Download className="size-4" aria-hidden />
              {t("files.preview.downloadFile")}
            </Button>
          )}
          {kind !== "unsupported" && (
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="preview-press rounded-full"
            >
              <RotateCw className="size-4" aria-hidden />
              {t("files.preview.retry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
