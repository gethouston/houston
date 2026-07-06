import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveDownload } from "../../hooks/use-save-download";
import { tauriFiles } from "../../lib/tauri";

/**
 * In-browser preview for a workspace file (web build). Images, PDFs and
 * text-ish files render inline; everything else (pptx, xlsx, …) gets a
 * "download to open" fallback. Bytes come over the authenticated download
 * route, so nothing here assumes a local filesystem.
 */

const TEXT_PREVIEW_LIMIT = 256 * 1024;

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "image" | "pdf"; url: string; blob: Blob }
  | { state: "text"; text: string; blob: Blob }
  | { state: "binary"; blob: Blob };

interface Props {
  agentPath: string;
  /** Workspace-relative path of the file to preview, or null when closed. */
  filePath: string | null;
  fileName: string;
  onClose: () => void;
}

export function FilePreviewDialog({
  agentPath,
  filePath,
  fileName,
  onClose,
}: Props) {
  const { t } = useTranslation("agents");
  const save = useSaveDownload();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoaded({ state: "loading" });
    tauriFiles
      .download(agentPath, filePath, { toast: false }) // failure renders inline below
      .then(async ({ blob, contentType }) => {
        if (cancelled) return;
        if (contentType.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "image", url: objectUrl, blob });
        } else if (contentType.includes("pdf")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "pdf", url: objectUrl, blob });
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
        if (!cancelled)
          setLoaded({
            state: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [agentPath, filePath]);

  const blob = "blob" in loaded ? loaded.blob : null;

  return (
    <Dialog open={!!filePath} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{fileName}</DialogTitle>
          {loaded.state === "binary" && (
            <DialogDescription>
              {t("files.preview.unsupportedDescription")}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-[200px] max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/20">
          {loaded.state === "loading" && (
            <p className="p-6 text-sm text-muted-foreground">
              {t("files.preview.loading")}
            </p>
          )}
          {loaded.state === "error" && (
            <div className="p-6 space-y-1">
              <p className="text-sm font-medium">
                {t("files.preview.errorTitle")}
              </p>
              <p className="text-sm text-muted-foreground break-all">
                {loaded.message}
              </p>
            </div>
          )}
          {loaded.state === "image" && (
            <img
              src={loaded.url}
              alt={fileName}
              className="mx-auto max-h-[58vh] object-contain"
            />
          )}
          {loaded.state === "pdf" && (
            <iframe
              src={loaded.url}
              title={fileName}
              className="h-[58vh] w-full border-0"
            />
          )}
          {loaded.state === "text" && (
            <pre className="p-4 text-xs whitespace-pre-wrap break-all">
              {loaded.text}
            </pre>
          )}
          {loaded.state === "binary" && (
            <p className="p-6 text-sm text-muted-foreground">
              {t("files.preview.unsupportedTitle")}
            </p>
          )}
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
