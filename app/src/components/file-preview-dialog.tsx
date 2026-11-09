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
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFilePreviewLoad } from "../hooks/use-file-preview-load";
import { useOpenAgentHref } from "../hooks/use-open-agent-file";
import { FilePreviewBody } from "./file-preview-body";

/**
 * In-app preview for a workspace file (web build, cloud pods, remote hosts).
 * Images, PDFs, HTML (rendered live in a sandboxed iframe — agent-built decks
 * preview as pages, not source), markdown (rendered as formatted prose) and
 * other text-ish files render inline. Office files use converted PDFs when
 * available; everything else gets a
 * "download to open" fallback — see `file-preview-body.tsx` for the rendering.
 * Bytes come over the authenticated download route, so nothing here assumes a
 * local filesystem, and a file the Files grid already thumbnailed is served
 * from the shared byte cache (`lib/file-bytes-cache.ts`) instead of downloaded
 * twice. Opened from the Files section and from chat file surfaces (file cards,
 * turn summaries, prose file pills) via `useOpenAgentFile`.
 */

interface Props {
  agentPath: string;
  /** Workspace-relative path of the file to preview, or null when closed. */
  filePath: string | null;
  fileName: string;
  /** Key into the shared byte cache, from `sharedBytesKey(file)` when the
   *  opener holds the entry (the Files section does). Omitted for anything the
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
  const openHref = useOpenAgentHref(agentPath || null);
  const { loaded, canDownload, download } = useFilePreviewLoad(
    agentPath,
    filePath,
    fileName,
    bytesCacheKey,
  );
  /** Reader-chosen full-viewport mode. A long document is unreadable in a
   *  60dvh window, so the modal can grow and shrink back (PRODUCT-1231). */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (filePath) setExpanded(false);
  }, [filePath]);

  // HTML files are mostly agent-built presentations: give them the whole
  // viewport so a 16:9 deck lays out horizontally. Sized from the NAME, not
  // the loaded state, so the dialog opens at full size instead of jumping
  // when the bytes land.
  const isDeck = /\.html?$/i.test(fileName);
  // A deck is born full-page; anything else starts compact and the reader can
  // ask for the room. Reset per file so a document never inherits the last
  // one's size.
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
          {/* `pr-16` clears BOTH the dialog's close button and the expand
              toggle beside it, so a long name ellipsizes before it runs under
              them. `title` keeps the full name reachable on hover. */}
          <DialogTitle className="truncate pr-16" title={fileName}>
            {fileName}
          </DialogTitle>
          {loaded.state === "binary" && (
            <DialogDescription>
              {t("files.preview.unsupportedDescription")}
            </DialogDescription>
          )}
          {/* A deck already fills the viewport, so it has nothing to toggle.
              Sits beside the close button (which the dialog positions
              absolutely) rather than in the footer: resizing is chrome, and
              the footer is for what you DO with the file. */}
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
        {/* `min-w-0` + `overflow-x-hidden`: the frame is the hard boundary the
            content may never cross. Anything genuinely unwrappable (a code
            block, a wide table) scrolls inside its own child frame. */}
        <div
          className={cn(
            "min-w-0 rounded-md border border-line bg-chip-subtle/20",
            // A DECK fills the frame with its own iframe and must not scroll
            // the frame itself. A document always scrolls — expanding only
            // buys it a taller window, so `overflow-hidden` here would clip
            // the very content the reader expanded to see.
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
          {canDownload && (
            <Button type="button" onClick={() => void download()}>
              {t("files.preview.download")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
