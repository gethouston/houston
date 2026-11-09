import { cn, FileTypeGlyphInline } from "@houston-ai/core";
import {
  Check,
  ChevronDown,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  Plus,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./icon-button";

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface PreviewHeaderProps {
  fileName: string;
  /** What the file is doing: converting on first open, or just reloaded
   *  because the agent rewrote it. */
  status: "converting" | "updated" | null;
  /** "3 / 8" while a paged document shows; null otherwise. */
  pager: { page: number; count: number } | null;
  /** The phone's thumbnail strip, which the page counter opens. */
  strip: { open: boolean; onToggle: () => void } | null;
  /** The page zoom, or null when the body has none. */
  zoom: number | null;
  onZoom: (zoom: number) => void;
  rail: { shown: boolean; onToggle: () => void } | null;
  canDownload: boolean;
  onDownload: () => void;
  /** Null when the row is too narrow for the chat beside it. */
  expand: { expanded: boolean; onToggle: () => void } | null;
  onClose: () => void;
}

/** The preview's quiet header: file, page, zoom, download, size, close. */
export function FilePreviewHeader(props: PreviewHeaderProps) {
  const { fileName, status, pager, strip, zoom, onZoom, rail, expand } = props;
  const { t } = useTranslation("agents");
  const extension = fileName.split(".").pop() ?? "";
  const zoomIndex = zoom === null ? -1 : ZOOM_STEPS.indexOf(zoom as 1);
  return (
    <header className="flex h-13 shrink-0 items-center gap-1 border-b border-line bg-pane px-2">
      {rail && (
        <IconButton
          icon={PanelLeft}
          label={t(
            rail.shown ? "files.preview.hidePages" : "files.preview.showPages",
          )}
          pressed={rail.shown}
          onClick={rail.onToggle}
          className="hidden @min-[520px]/preview:grid"
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5">
        <FileTypeGlyphInline
          extension={extension}
          className="size-4 shrink-0"
        />
        <h2 className="truncate text-sm font-medium text-ink" title={fileName}>
          {fileName}
        </h2>
        {status && (
          <span
            role="status"
            className={cn(
              "preview-status flex shrink-0 items-center gap-1 text-xs",
              status === "updated" ? "text-success-ink" : "text-ink-muted",
            )}
          >
            {status === "updated" && <Check className="size-3.5" aria-hidden />}
            {t(
              status === "updated"
                ? "files.preview.updated"
                : "files.preview.converting",
            )}
          </span>
        )}
      </div>
      {pager && (
        <button
          type="button"
          disabled={!strip}
          onClick={strip?.onToggle}
          aria-expanded={strip ? strip.open : undefined}
          aria-label={t("files.preview.pagerLabel", pager)}
          className="preview-press flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2 text-[13px] text-hover-text tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none"
        >
          {t("files.preview.pager", pager)}
          {strip && (
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 transition-transform duration-200",
                strip.open && "rotate-180",
              )}
            />
          )}
        </button>
      )}
      {zoom !== null && (
        <div className="hidden shrink-0 items-center @min-[440px]/preview:flex">
          <span aria-hidden className="mx-1 h-4.5 w-px bg-line-input" />
          <IconButton
            icon={Minus}
            label={t("files.preview.zoomOut")}
            disabled={zoomIndex <= 0}
            onClick={() => onZoom(ZOOM_STEPS[zoomIndex - 1] ?? zoom)}
          />
          <button
            type="button"
            onClick={() => onZoom(1)}
            aria-label={t("files.preview.zoomFit")}
            title={t("files.preview.zoomFit")}
            className="preview-press h-8 min-w-15 rounded-lg px-1.5 text-[13px] text-hover-text tabular-nums outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
          >
            {zoom === 1 ? t("files.preview.fit") : `${Math.round(zoom * 100)}%`}
          </button>
          <IconButton
            icon={Plus}
            label={t("files.preview.zoomIn")}
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={() => onZoom(ZOOM_STEPS[zoomIndex + 1] ?? zoom)}
          />
          <span aria-hidden className="mx-1 h-4.5 w-px bg-line-input" />
        </div>
      )}
      {props.canDownload && (
        <IconButton
          icon={Download}
          label={t("files.preview.downloadOriginal", { extension })}
          onClick={props.onDownload}
        />
      )}
      {expand && (
        <IconButton
          icon={expand.expanded ? Minimize2 : Maximize2}
          label={t(
            expand.expanded ? "files.preview.collapse" : "files.preview.expand",
          )}
          onClick={expand.onToggle}
          className="hidden md:grid"
        />
      )}
      <IconButton
        icon={X}
        label={t("files.preview.closePanel")}
        shortcut="Esc"
        onClick={props.onClose}
      />
    </header>
  );
}
