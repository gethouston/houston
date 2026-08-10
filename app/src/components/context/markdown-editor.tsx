import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";

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

const proseClass = [
  "text-sm text-ink leading-relaxed",
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold",
  "[&_h3]:text-base [&_h3]:font-medium [&_p]:my-1.5",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-input",
  "[&_blockquote]:pl-3 [&_blockquote]:text-ink-muted",
  "[&_code]:rounded-sm [&_code]:bg-chip [&_code]:px-1",
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
  minRows?: number;
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
  minRows = 12,
}: MarkdownEditorProps) {
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
        class: `min-h-full outline-none ${proseClass}`,
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
    <div
      className="relative w-full rounded-lg border border-line-input bg-input px-4 py-3 text-ink has-[.ProseMirror:focus-visible]:ring-2 has-[.ProseMirror:focus-visible]:ring-focus"
      style={{ minHeight: `${minRows * 1.5}rem` }}
    >
      {!readOnly && empty ? (
        <EditorContent
          editor={preview}
          className={`pointer-events-none absolute inset-x-4 top-3 text-ink-muted/60 ${proseClass}`}
        />
      ) : null}
      <EditorContent
        editor={editor}
        className={readOnly ? "cursor-default text-ink-muted" : undefined}
      />
    </div>
  );
}
