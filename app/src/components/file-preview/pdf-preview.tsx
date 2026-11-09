import { useIsMobile } from "@houston-ai/core";
import {
  CommentEditor,
  PdfPages,
  type PdfPagesHandle,
  ThumbnailRail,
  usePdfDocument,
} from "@houston-ai/pdf";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { citationsFacade } from "../../lib/citations-facade";
import { logAndReportError } from "../../lib/error-report";
import { isMac } from "../../lib/platform";
import { useCitationFocus } from "../../stores/citation-focus";
import type { FilePreviewTarget } from "../../stores/ui/types";
import { isPresentation, pageName } from "./citation-labels";
import { PreviewFloatBars } from "./preview-float-bars";
import { PreviewSkeleton } from "./preview-states";
import { useCommentHint } from "./use-comment-hint";
import { usePdfLanding } from "./use-pdf-landing";
import { usePreviewComments } from "./use-preview-comments";

const reportPdf = (error: unknown) => logAndReportError("pdf_preview", error);

/**
 * A paged document in the panel: the continuous pages, the thumbnail rail
 * (a strip under the counter on the phone), and commenting. A selection asks
 * "what should the agent change?"; the answer becomes a chip in the chat's
 * composer and a numbered mark here, the two linked both ways.
 */
export function PdfPreview({
  data,
  target,
  zoom,
  rail,
  strip,
  chatHidden,
  onPager,
  onBackToChat,
  fallback,
}: {
  data: Blob;
  target: FilePreviewTarget;
  zoom: number;
  rail: boolean;
  strip: boolean;
  /** The chat is out of sight (phone sheet, expanded panel). */
  chatHidden: boolean;
  onPager: (pager: { page: number; count: number }) => void;
  onBackToChat: () => void;
  /** Shown when pdf.js cannot open the bytes at all. */
  fallback: ReactNode;
}) {
  const { t } = useTranslation("agents");
  const mobile = useIsMobile();
  const doc = usePdfDocument(data, reportPdf);
  const pages = useRef<PdfPagesHandle>(null);
  const [active, setActive] = useState(1);
  const { filePath, fileName } = target;
  const draftKey = target.chat?.draftKey ?? null;
  const comments = usePreviewComments({ draftKey, filePath, fileName });
  const hint = useCommentHint(comments.selectable, mobile);
  const hotId = useCitationFocus((s) => s.hotId);
  const setHot = useCitationFocus((s) => s.setHot);
  const handle = doc.status === "ready" ? doc.handle : null;
  const lastEditor = useRef(comments.editor);
  const count = handle?.pageCount ?? 0;

  useEffect(() => {
    if (count) onPager({ page: active, count });
  }, [active, count, onPager]);
  // A rewrite that drops pages flags the comments on them instead of
  // silently losing them; a page that comes back unflags them.
  useEffect(() => {
    if (count && draftKey)
      citationsFacade.module().reconcile(draftKey, filePath, count);
  }, [count, draftKey, filePath]);
  usePdfLanding(pages, handle, filePath, target.page, comments.marks);

  if (doc.status === "error") return fallback;
  if (!handle)
    return (
      <PreviewSkeleton
        fileName={fileName}
        paged
        label={t("files.preview.loading")}
      />
    );

  const slides = isPresentation(fileName);
  const editor = comments.editor;
  // The closing popover keeps its anchor and copy through its exit.
  if (editor) lastEditor.current = editor;
  const shown = editor ?? lastEditor.current;
  const thumbs = (asStrip: boolean, className: string) => (
    <ThumbnailRail
      handle={handle}
      active={active}
      counts={comments.counts}
      strip={asStrip}
      heading={t(slides ? "files.preview.slides" : "files.preview.pages", {
        count,
      })}
      thumbLabel={(page, n) =>
        n === 0
          ? pageName(t, fileName, page)
          : t("files.preview.thumbLabel", {
              where: pageName(t, fileName, page),
              count: n,
            })
      }
      onPick={(page) => pages.current?.scrollToPage(page)}
      onError={reportPdf}
      className={className}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {strip && thumbs(true, "shrink-0 border-b border-line bg-pane md:hidden")}
      <div className="flex min-h-0 flex-1">
        {rail &&
          thumbs(
            false,
            "hidden w-31 shrink-0 border-r border-line bg-pane @min-[520px]/preview:flex",
          )}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <PdfPages
            ref={pages}
            handle={handle}
            zoom={zoom}
            marks={comments.marks}
            pending={comments.pending}
            selectable={comments.selectable}
            hotMarkId={hotId}
            onHotMark={setHot}
            onMarkActivate={comments.activateMark}
            onSelect={(event) => {
              hint.done();
              comments.select(event);
            }}
            onTouchText={comments.setTouchText}
            onGestureStart={comments.cancel}
            onActivePage={setActive}
            onError={reportPdf}
            pageLabel={(page) => pageName(t, fileName, page)}
            pinLabel={(mark) =>
              t("files.preview.comments.pin", {
                n: mark.n,
                comment: mark.comment || t("files.preview.comments.noComment"),
              })
            }
          />
          {!editor && (
            <div className="pointer-events-none absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+16px)] flex justify-center *:pointer-events-auto">
              <PreviewFloatBars
                hint={hint.kind}
                onHintDone={hint.done}
                touchSelection={comments.touchText !== null}
                onCommentSelection={() =>
                  comments.touchText && comments.select(comments.touchText)
                }
                ready={chatHidden ? comments.count : 0}
                onReady={onBackToChat}
              />
            </div>
          )}
        </div>
      </div>
      <CommentEditor
        key={comments.editorKey}
        open={editor !== null}
        anchorRect={shown?.rect ?? (() => new DOMRect())}
        cropBase64={shown?.cropBase64}
        returnFocus={() => pages.current?.focus()}
        context={shown?.context ?? ""}
        initial={shown?.initial ?? ""}
        editing={shown?.editing ?? false}
        labels={{
          placeholder: t("files.preview.comments.placeholder"),
          cancel: t("files.preview.comments.cancel"),
          add: t("files.preview.comments.add"),
          save: t("files.preview.comments.save"),
          remove: t("files.preview.comments.remove"),
          shortcut: isMac ? "⌘↵" : "Ctrl+↵",
        }}
        onSubmit={comments.submit}
        onCancel={comments.cancel}
        onRemove={comments.remove}
      />
    </div>
  );
}
