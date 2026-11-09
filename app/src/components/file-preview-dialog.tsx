import { previewPlan, previewRefusalAction } from "@houston/sdk/files/preview";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useOpenAgentHref } from "../hooks/use-open-agent-file";
import { useSaveDownload } from "../hooks/use-save-download";
import {
  genericErrorDescription,
  logAndReportError,
} from "../lib/error-report";
import { fetchFileBytes } from "../lib/file-bytes-cache";
import { isFileGoneError } from "../lib/file-gone";
import { tauriFiles } from "../lib/tauri";
import { FilePreviewBody, type Loaded } from "./file-preview-body";

const TEXT_PREVIEW_LIMIT = 256 * 1024;

interface Props {
  agentPath: string;
  filePath: string | null;
  fileName: string;
  /** Thumbnail byte-cache key, omitted for files the grid cannot thumbnail. */
  bytesCacheKey?: number;
  onClose: () => void;
}

export function FilePreviewDialog({
  agentPath,
  filePath,
  fileName,
  bytesCacheKey,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation("agents");
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const plan = previewPlan(fileName, capabilities);
  const lang = i18n.language;
  const save = useSaveDownload();
  const queryClient = useQueryClient();
  const openHref = useOpenAgentHref(agentPath || null);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!filePath || capabilitiesLoading) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoaded({ state: "loading" });
    setExpanded(false);
    fetchFileBytes(queryClient, agentPath, filePath, bytesCacheKey)
      .then(async (original) => {
        if (cancelled) return;
        let preview = original;
        if (plan === "pdf") {
          try {
            preview = await tauriFiles.download(agentPath, filePath, {
              toast: false,
              as: "pdf",
              lang,
            });
          } catch (error) {
            const action = previewRefusalAction(error);
            if (action === null) throw error;
            if (action === "report-and-fallback")
              logAndReportError("office_preview", error);
          }
        }
        if (cancelled) return;
        const { blob, contentType } = preview;
        if (contentType.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "image", url: objectUrl, blob: original.blob });
        } else if (contentType.includes("pdf")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "pdf", url: objectUrl, blob: original.blob });
        } else if (contentType.includes("html")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "html", url: objectUrl, blob: original.blob });
        } else if (
          contentType.startsWith("text/") ||
          contentType.includes("json") ||
          contentType.includes("csv")
        ) {
          const text = await blob.slice(0, TEXT_PREVIEW_LIMIT).text();
          if (!cancelled) setLoaded({ state: "text", text, blob });
        } else {
          setLoaded({ state: "binary", blob });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoaded({
          state: "error",
          message: isFileGoneError(err)
            ? t("files.gone.description")
            : genericErrorDescription("preview_file", err),
        });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    agentPath,
    filePath,
    bytesCacheKey,
    queryClient,
    t,
    plan,
    lang,
    capabilitiesLoading,
  ]);

  const blob = "blob" in loaded ? loaded.blob : null;

  const isDeck = /\.html?$/i.test(fileName);
  const fullPage = isDeck || expanded;

  return (
    <Dialog open={!!filePath} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={
          fullPage
            ? "h-[92dvh] sm:max-w-[95vw] grid-rows-[auto_minmax(0,1fr)_auto]"
            : "sm:max-w-[min(48rem,calc(100%-2rem))]"
        }
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate pr-16" title={fileName}>
            {fileName}
          </DialogTitle>
          {loaded.state === "binary" && (
            <DialogDescription>
              {t("files.preview.unsupportedDescription")}
            </DialogDescription>
          )}
          {!isDeck && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={t(
                expanded ? "files.preview.collapse" : "files.preview.expand",
              )}
              className="absolute top-4 right-12 rounded-lg p-1.5 text-ink-muted transition-colors duration-200 hover:bg-hover hover:text-ink"
            >
              {expanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
              <span className="sr-only">
                {t(
                  expanded ? "files.preview.collapse" : "files.preview.expand",
                )}
              </span>
            </button>
          )}
        </DialogHeader>
        <div
          className={cn(
            "min-w-0 rounded-md border border-line bg-chip-subtle/20",
            isDeck && "min-h-0 overflow-hidden",
            !isDeck && "overflow-y-auto overflow-x-hidden",
            !isDeck && (expanded ? "min-h-0" : "min-h-[200px] max-h-[60dvh]"),
          )}
        >
          <FilePreviewBody
            loaded={loaded}
            fileName={fileName}
            fullPage={fullPage}
            onOpenLink={openHref}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("files.preview.close")}
          </Button>
          {blob && (
            <Button type="button" onClick={() => void save(fileName, blob)}>
              {t("files.preview.download")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
