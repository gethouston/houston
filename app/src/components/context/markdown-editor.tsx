import { cn } from "@houston-ai/core";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useEffect } from "react";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { MarkdownToolbar } from "./markdown-toolbar";

const extensions = [StarterKit, Markdown];

/**
 * The markdown the doc currently serializes to. `tiptap-markdown` registers
 * its storage under `markdown` but does not augment @tiptap/core's `Storage`
 * type, so the one cast lives here instead of at every call site.
 */
function serialized(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: MarkdownStorage }
  ).markdown.getMarkdown();
}

/**
 * The document's type: 16px body (the input floor from the polish checklist)
 * under a modest heading ladder — a document field, not a marketing page.
 * Headings open their block (`mt` collapses on the first child) so a doc
 * that starts with a title sits flush with the card's padding.
 */
const proseClass = [
  "text-base text-ink leading-relaxed",
  "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1:first-child]:mt-0",
  "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2:first-child]:mt-0",
  "[&_h3]:text-base [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1 [&_h3:first-child]:mt-0",
  "[&_p]:my-2 [&_p:first-child]:mt-0",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line",
  "[&_blockquote]:pl-3 [&_blockquote]:text-ink-muted",
  "[&_code]:rounded-sm [&_code]:bg-chip [&_code]:px-1 [&_code]:text-sm",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-chip [&_pre]:p-3",
].join(" ");

export interface MarkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  onBlur: () => void;
  onFocusChange?: (focused: boolean) => void;
  readOnly?: boolean;
  placeholder: string;
  ariaLabel?: string;
  dataTestId?: string;
  /**
   * Rows floor for a COMPACT box (a card among other cards, like the team
   * context). Omitted, the document fills the screen's remaining height —
   * the default for full-page context surfaces.
   */
  minRows?: number;
  /** The save status node, seated on the toolbar's right edge. */
  statusSlot?: ReactNode;
}

export function MarkdownEditor({
  content,
  onChange,
  onBlur,
  onFocusChange,
  readOnly = false,
  placeholder,
  ariaLabel,
  dataTestId,
  minRows,
  statusSlot,
}: MarkdownEditorProps) {
  // Two layouts. FILL (no minRows): the card is PINNED — it takes the height
  // its parents grant (the page column ends at a fixed bottom gap), and a
  // longer document scrolls INSIDE it, so the card never grows and a window
  // resize only moves its bottom edge. COMPACT (minRows): a rows floor that
  // grows with the text, for a card among other cards.
  const fill = minRows === undefined;
  const minHeight = fill ? "100%" : `${minRows * 1.5}rem`;
  const editor = useEditor({
    extensions,
    content,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-readonly": String(readOnly),
        ...(ariaLabel !== undefined && { "aria-label": ariaLabel }),
        ...(dataTestId !== undefined && { "data-testid": dataTestId }),
        // The editable node IS the whole visible page: it carries the card's
        // content padding and min-height itself, so a click anywhere in the
        // frame lands in the document and places the caret — a wrapper that
        // only LOOKS like the field would be dead below the first line.
        class: `outline-none px-5 py-4 ${proseClass}`,
        style: `min-height: ${minHeight}`,
      },
    },
    // The parent's dirty baseline is the SEEDED DOC'S OWN serialization
    // (markdown → doc → markdown may normalize bullets/whitespace), so the
    // baseline is announced the moment the doc exists — unconditionally,
    // or a prop that round-trips unchanged would leave the baseline unseeded
    // and the user's FIRST edit would read as clean.
    onCreate: ({ editor: created }) => onChange(serialized(created)),
    onUpdate: ({ editor: activeEditor }) => {
      onChange(serialized(activeEditor));
    },
    onFocus: () => onFocusChange?.(true),
    onBlur: () => {
      onFocusChange?.(false);
      onBlur();
    },
  });
  const preview = useEditor({
    extensions,
    content: placeholder,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      // Purely decorative: without this the overlay would announce as a
      // SECOND textbox (TipTap's default role), a phantom editor to
      // assistive tech.
      attributes: { "aria-hidden": "true", role: "presentation" },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    // Every keystroke echoes back as a `content` prop change (the parent is
    // controlled on the serialized markdown). Replacing the doc on that echo
    // would throw the cursor away mid-word, so only a GENUINELY different
    // markdown — an external reseed — rebuilds the doc.
    if (serialized(editor) === content) return;
    editor.commands.setContent(content, { emitUpdate: false });
    onChange(serialized(editor));
  }, [content, editor, onChange]);

  const empty = editor?.isEmpty ?? content.length === 0;

  return (
    // The document CARD: the canonical floating surface on bg-card, framed
    // with the field border (line-input, a step darker than the hairline) —
    // this is a page you write, not a recessed gray form input.
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-line-input bg-card text-ink has-[.ProseMirror:focus-visible]:ring-2 has-[.ProseMirror:focus-visible]:ring-focus",
        fill && "flex h-full min-h-64 flex-col",
      )}
    >
      {!readOnly && editor ? (
        <MarkdownToolbar editor={editor} trailing={statusSlot} />
      ) : null}
      <div className={cn("relative", fill && "min-h-0 flex-1 overflow-y-auto")}>
        {!readOnly && empty ? (
          <EditorContent
            editor={preview}
            className={`pointer-events-none absolute inset-0 px-5 py-4 text-ink-muted/60 ${proseClass}`}
          />
        ) : null}
        {/* In fill mode the wrapper's definite height flows down (h-full) so
            the ProseMirror node's min-height:100% resolves; a longer doc
            simply overflows into the wrapper's own scroll. */}
        <EditorContent
          editor={editor}
          className={cn(
            fill && "h-full",
            readOnly && "cursor-default text-ink-muted",
          )}
        />
      </div>
    </div>
  );
}
