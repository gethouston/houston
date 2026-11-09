import { cn, useIsMobile } from "@houston-ai/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { useUIStore } from "../../stores/ui";
import type { FilePreviewTarget } from "../../stores/ui/types";
import { FilePreviewBody, type Loaded } from "./file-preview-body";
import { FilePreviewHeader } from "./file-preview-header";
import { PdfPreview } from "./pdf-preview";
import {
  isPagedFile,
  PreviewFallback,
  PreviewSkeleton,
} from "./preview-states";
import { useFilePreviewLoad } from "./use-file-preview-load";

const shows = (l: Loaded) =>
  l.state !== "loading" && l.state !== "error" && l.state !== "binary";

/** True for a moment after the same file's content is replaced in place. */
function useUpdatedFlash(loaded: Loaded, filePath: string): boolean {
  const [updated, setUpdated] = useState(false);
  const previous = useRef<{ filePath: string; loaded: Loaded } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const p = previous.current;
    previous.current = { filePath, loaded };
    if (!p || p.filePath !== filePath) return setUpdated(false);
    if (!shows(p.loaded) || !shows(loaded) || p.loaded === loaded) return;
    setUpdated(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setUpdated(false), 2400);
  }, [loaded, filePath]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return updated;
}

/**
 * The file preview: a card beside the chat on the desktop (resizable, can
 * take the whole row), a full-screen sheet on the phone that back closes.
 * One file at a time; opening another swaps the content. Opened from a chat,
 * its paged files take comments for that chat's agent.
 */
export function FilePreviewPanel({
  target,
  leaving,
  expanded,
  canExpand,
  width,
}: {
  target: FilePreviewTarget;
  /** Closed, playing its exit. */
  leaving: boolean;
  expanded: boolean;
  /** False when the row has no room for the chat beside it. */
  canExpand: boolean;
  /** The desktop card's CSS width. */
  width: string;
}) {
  const { t } = useTranslation("agents");
  const mobile = useIsMobile();
  const setFilePreview = useUIStore((s) => s.setFilePreview);
  const toggleExpanded = useUIStore((s) => s.togglePreviewExpanded);
  const rail = useUIStore((s) => s.previewRail);
  const toggleRail = useUIStore((s) => s.togglePreviewRail);
  const { agentPath, filePath, fileName } = target;
  const { loaded, canDownload, download, retry, converts } = useFilePreviewLoad(
    agentPath,
    filePath,
    fileName,
    target.bytesCacheKey,
  );
  const openHref = useOpenAgentHref(agentPath, target.chat?.draftKey ?? null);
  const [zoom, setZoom] = useState(1);
  const [pager, setPager] = useState<{ page: number; count: number } | null>(
    null,
  );
  const [strip, setStrip] = useState(false);
  const updated = useUpdatedFlash(loaded, filePath);
  const fileKey = `${agentPath}:${filePath}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: per file
  useEffect(() => {
    setZoom(1);
    setPager(null);
    setStrip(false);
  }, [fileKey]);

  const close = useCallback(() => setFilePreview(null), [setFilePreview]);
  // Esc closes from anywhere the panel's layers (the comment popover, menus)
  // and the board's own Esc handling have not claimed the key.
  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaving, close]);

  const fallback = (
    kind: "failed" | "unsupported" | "error",
    message?: string,
  ) => (
    <PreviewFallback
      kind={kind}
      fileName={fileName}
      message={message}
      canDownload={canDownload}
      onDownload={() => void download()}
      onRetry={retry}
    />
  );
  const paged = loaded.state === "pdf";
  const body =
    loaded.state === "loading" ? (
      <PreviewSkeleton
        fileName={fileName}
        paged={isPagedFile(fileName, converts)}
        label={t("files.preview.loading")}
      />
    ) : loaded.state === "error" ? (
      fallback("error", loaded.message)
    ) : loaded.state === "binary" ? (
      fallback(converts ? "failed" : "unsupported")
    ) : loaded.state === "pdf" ? (
      <PdfPreview
        key={fileKey}
        data={loaded.data}
        target={target}
        zoom={zoom}
        rail={rail}
        strip={strip}
        chatHidden={mobile || expanded}
        onPager={setPager}
        onBackToChat={() => (mobile || !canExpand ? close() : toggleExpanded())}
        fallback={fallback("failed")}
      />
    ) : (
      <FilePreviewBody
        loaded={loaded}
        fileName={fileName}
        onOpenLink={openHref}
      />
    );

  return (
    <section
      aria-label={t("files.preview.panelLabel", { fileName })}
      data-leaving={leaving ? "true" : undefined}
      style={{ "--preview-w": width } as React.CSSProperties}
      className={cn(
        "preview-panel @container/preview fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-background pt-safe canvas-screen",
        "md:relative md:inset-auto md:z-auto md:h-auto md:rounded-2xl md:pt-0",
        expanded ? "md:min-w-0 md:flex-1" : "md:w-(--preview-w) md:flex-none",
      )}
    >
      <FilePreviewHeader
        fileName={fileName}
        status={
          updated
            ? "updated"
            : loaded.state === "loading" && converts
              ? "converting"
              : null
        }
        pager={paged ? pager : null}
        strip={
          mobile && paged
            ? { open: strip, onToggle: () => setStrip((v) => !v) }
            : null
        }
        zoom={paged ? zoom : null}
        onZoom={setZoom}
        rail={paged ? { shown: rail, onToggle: toggleRail } : null}
        canDownload={canDownload}
        onDownload={() => void download()}
        expand={canExpand ? { expanded, onToggle: toggleExpanded } : null}
        onClose={close}
      />
      {body}
    </section>
  );
}
