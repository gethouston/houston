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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpenAgentHref } from "../hooks/use-open-agent-file";
import { useSaveDownload } from "../hooks/use-save-download";
import { genericErrorDescription } from "../lib/error-report";
import { fetchFileBytes } from "../lib/file-bytes-cache";
import { FilePreviewBody, type Loaded } from "./file-preview-body";

/**
 * In-app preview for a workspace file (web build, cloud pods, remote hosts).
 * Images, PDFs, HTML (rendered live in a sandboxed iframe — agent-built decks
 * preview as pages, not source), markdown (rendered as formatted prose) and
 * other text-ish files render inline; everything else (pptx, xlsx, …) gets a
 * "download to open" fallback — see `file-preview-body.tsx` for the rendering.
 * Bytes come over the authenticated download route, so nothing here assumes a
 * local filesystem, and a file the Files grid already thumbnailed is served
 * from the shared byte cache (`lib/file-bytes-cache.ts`) instead of downloaded
 * twice. Opened from the Files tab and from chat file surfaces (file cards,
 * turn summaries, prose file pills) via `useOpenAgentFile`.
 */

const TEXT_PREVIEW_LIMIT = 256 * 1024;

interface Props {
  agentPath: string;
  /** Workspace-relative path of the file to preview, or null when closed. */
  filePath: string | null;
  fileName: string;
  /** Key into the shared byte cache, from `sharedBytesKey(file)` when the
   *  opener holds the entry (the Files tab does). Omitted for anything the
   *  grid could not have thumbnailed, which downloads directly rather than
   *  parking an unbounded blob in memory. */
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
  const { t } = useTranslation("agents");
  const save = useSaveDownload();
  const queryClient = useQueryClient();
  const openHref = useOpenAgentHref(agentPath || null);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoaded({ state: "loading" });
    // Failure renders inline below (the fetch is toast-free by design).
    fetchFileBytes(queryClient, agentPath, filePath, bytesCacheKey)
      .then(async ({ blob, contentType }) => {
        if (cancelled) return;
        if (contentType.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "image", url: objectUrl, blob });
        } else if (contentType.includes("pdf")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "pdf", url: objectUrl, blob });
        } else if (contentType.includes("html")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ state: "html", url: objectUrl, blob });
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
            message: genericErrorDescription("preview_file", err),
          });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [agentPath, filePath, bytesCacheKey, queryClient]);

  const blob = "blob" in loaded ? loaded.blob : null;

  // HTML files are mostly agent-built presentations: give them the whole
  // viewport so a 16:9 deck lays out horizontally. Sized from the NAME, not
  // the loaded state, so the dialog opens at full size instead of jumping
  // when the bytes land.
  const fullPage = /\.html?$/i.test(fileName);

  return (
    <Dialog open={!!filePath} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={
          fullPage
            ? "h-[92vh] max-w-[95vw] sm:max-w-[95vw] grid-rows-[auto_minmax(0,1fr)_auto]"
            : "max-w-3xl"
        }
      >
        <DialogHeader className="min-w-0">
          {/* `pr-8` clears the dialog's absolutely-positioned close button, so
              a long name ellipsizes before it runs under the X rather than
              after. `title` keeps the full name reachable on hover. */}
          <DialogTitle className="truncate pr-8" title={fileName}>
            {fileName}
          </DialogTitle>
          {loaded.state === "binary" && (
            <DialogDescription>
              {t("files.preview.unsupportedDescription")}
            </DialogDescription>
          )}
        </DialogHeader>
        {/* `min-w-0` + `overflow-x-hidden`: the frame is the hard boundary the
            content may never cross. Anything genuinely unwrappable (a code
            block, a wide table) scrolls inside its own child frame. */}
        <div
          className={cn(
            "min-w-0 rounded-md border border-line bg-chip-subtle/20",
            fullPage
              ? "min-h-0 overflow-hidden"
              : "min-h-[200px] max-h-[60vh] overflow-y-auto overflow-x-hidden",
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
