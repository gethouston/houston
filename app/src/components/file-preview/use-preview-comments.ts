import type { PdfMark, PdfSelectEvent, PdfSelection } from "@houston-ai/pdf";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { citationsFacade } from "../../lib/citations-facade";
import { showExpectedStateToast } from "../../lib/error-toast";
import { citationContext } from "./citation-labels";
import { useDraftCitations } from "./use-draft-citations";

/** The comment editor's subject: a fresh selection, or a pinned comment. */
type Editor =
  | { kind: "new"; selection: PdfSelection; rect: () => DOMRect }
  | { kind: "edit"; id: string; rect: () => DOMRect };

/**
 * The previewed file's side of a chat's comments: the marks its pages draw
 * (numbered as the composer chips are, across every file in the draft), the
 * per-page counts its thumbnails show, and the editor a selection or a pin
 * opens. Without a chat (`draftKey` null) nothing is selectable.
 */
export function usePreviewComments({
  draftKey,
  filePath,
  fileName,
}: {
  draftKey: string | null;
  filePath: string;
  fileName: string;
}) {
  const { t } = useTranslation("agents");
  const all = useDraftCitations(draftKey);
  const [editor, setEditorState] = useState<Editor | null>(null);
  // Each opening is a fresh form; closing keeps the key so the exit plays.
  const [editorKey, setEditorKey] = useState(0);
  const setEditor = (next: Editor | null) => {
    if (next) setEditorKey((k) => k + 1);
    setEditorState(next);
  };
  const [touchText, setTouchText] = useState<PdfSelectEvent | null>(null);

  const marks = useMemo<PdfMark[]>(
    () =>
      all.flatMap((c, i) =>
        c.filePath === filePath
          ? [
              {
                id: c.id,
                n: i + 1,
                page: c.page,
                anchor: c.anchor,
                comment: c.comment,
                detached: c.detached,
              },
            ]
          : [],
      ),
    [all, filePath],
  );
  const counts = useMemo(() => {
    const byPage = new Map<number, number>();
    for (const m of marks) byPage.set(m.page, (byPage.get(m.page) ?? 0) + 1);
    return byPage;
  }, [marks]);

  const module = citationsFacade.module();
  const limitReached = () =>
    showExpectedStateToast(
      t("files.preview.comments.limitTitle", { limit: module.limit }),
      t("files.preview.comments.limitBody"),
    );

  const select = (event: PdfSelectEvent) => {
    if (!draftKey) return;
    setTouchText(null);
    if (all.length >= module.limit) return limitReached();
    setEditor({ kind: "new", selection: event.selection, rect: event.rect });
  };

  const submit = (comment: string) => {
    if (!draftKey || !editor) return;
    setEditor(null);
    if (editor.kind === "edit")
      return module.updateComment(draftKey, editor.id, comment.trim());
    const { selection } = editor;
    const added = module.add(draftKey, {
      filePath,
      fileName,
      page: selection.page,
      pageCount: selection.pageCount,
      anchor: selection.anchor,
      comment: comment.trim(),
      cropBase64: selection.cropBase64,
    });
    if (!added.ok) limitReached();
  };

  const editing =
    editor?.kind === "edit"
      ? (all.find((c) => c.id === editor.id) ?? null)
      : null;
  const subject =
    editor?.kind === "new"
      ? {
          page: editor.selection.page,
          quote:
            editor.selection.anchor.kind === "text"
              ? editor.selection.anchor.quote
              : undefined,
        }
      : editing
        ? {
            page: editing.page,
            quote:
              editing.anchor.kind === "text" ? editing.anchor.quote : undefined,
          }
        : null;

  return {
    selectable: draftKey !== null,
    editorKey,
    count: all.length,
    marks,
    counts,
    touchText,
    setTouchText,
    select,
    /** A pin was pressed: edit or delete its comment. */
    activateMark: (id: string, pin: HTMLElement) =>
      setEditor({ kind: "edit", id, rect: () => pin.getBoundingClientRect() }),
    editor: editor && {
      editing: editor.kind === "edit",
      rect: editor.rect,
      initial: editing?.comment ?? "",
      cropBase64:
        editor.kind === "new"
          ? editor.selection.cropBase64
          : editing?.cropBase64,
      context: subject ? citationContext(t, { fileName, ...subject }) : "",
    },
    /** The selection waiting for its comment, drawn dashed on its page. */
    pending:
      editor?.kind === "new"
        ? { page: editor.selection.page, anchor: editor.selection.anchor }
        : null,
    submit,
    cancel: () => setEditor(null),
    remove: () => {
      if (draftKey && editor?.kind === "edit")
        module.remove(draftKey, editor.id);
      setEditor(null);
    },
  };
}
