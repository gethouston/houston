import { cn } from "@houston-ai/core";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useEffect, useRef } from "react";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import {
  type ContextEditorLayout,
  compactMinHeight,
} from "./context-editor-model";
import { MarkdownToolbar } from "./markdown-toolbar";

const extensions = [StarterKit, Markdown];

function serialized(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: MarkdownStorage }
  ).markdown.getMarkdown();
}

const proseClass = [
  "text-base text-ink leading-relaxed",
  "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1:first-child]:mt-0",
  "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2:first-child]:mt-0",
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3:first-child]:mt-0",
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
  plain?: boolean;
  placeholder: string;
  ariaLabel?: string;
  dataTestId?: string;
  layout: ContextEditorLayout;
  statusSlot?: ReactNode;
}

function useCallbacksRef(props: MarkdownEditorProps) {
  const ref = useRef(props);
  ref.current = props;
  return ref;
}

const cardClass = (fill: boolean) =>
  cn(
    "w-full overflow-hidden rounded-xl border border-line-input bg-card text-ink",
    "has-[.ProseMirror:focus-visible]:ring-2 has-[.ProseMirror:focus-visible]:ring-focus",
    "has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-focus",
    fill && "flex h-full min-h-64 flex-col",
  );

export function MarkdownEditor(props: MarkdownEditorProps) {
  return props.plain ? <PlainEditor {...props} /> : <RichEditor {...props} />;
}

function PlainEditor(props: MarkdownEditorProps) {
  const { content, readOnly = false, ariaLabel, dataTestId, layout } = props;
  const callbacks = useCallbacksRef(props);

  useEffect(() => {
    callbacks.current.onChange(content);
  }, [content, callbacks]);

  const fill = layout === "fill";
  return (
    <div className={cardClass(fill)}>
      {!readOnly && props.statusSlot ? (
        <div className="flex shrink-0 items-center justify-end border-b border-line px-3 py-1.5">
          {props.statusSlot}
        </div>
      ) : null}
      <textarea
        aria-label={ariaLabel}
        data-testid={dataTestId}
        value={content}
        readOnly={readOnly}
        onChange={(e) => callbacks.current.onChange(e.target.value)}
        onFocus={() => callbacks.current.onFocusChange?.(true)}
        onBlur={() => {
          callbacks.current.onFocusChange?.(false);
          callbacks.current.onBlur();
        }}
        className={cn(
          "w-full resize-none bg-transparent px-5 py-4 text-base leading-relaxed text-ink outline-none",
          fill ? "min-h-0 flex-1" : "block",
          readOnly && "cursor-default text-ink-muted",
        )}
        style={fill ? undefined : { minHeight: compactMinHeight(layout.rows) }}
      />
    </div>
  );
}

function ExampleOverlay({ placeholder }: { placeholder: string }) {
  const preview = useEditor({
    extensions,
    content: placeholder,
    editable: false,
    editorProps: {
      attributes: { "aria-hidden": "true", role: "presentation" },
    },
  });
  return (
    <EditorContent
      editor={preview}
      className={`pointer-events-none absolute inset-0 overflow-hidden px-5 py-4 text-ink-muted/60 ${proseClass}`}
    />
  );
}

function RichEditor(props: MarkdownEditorProps) {
  const {
    content,
    readOnly = false,
    placeholder,
    ariaLabel,
    dataTestId,
    layout,
    statusSlot,
  } = props;
  const callbacks = useCallbacksRef(props);
  const fill = layout === "fill";

  const editor = useEditor({
    extensions,
    content,
    editable: !readOnly,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-readonly": String(readOnly),
        ...(ariaLabel !== undefined && { "aria-label": ariaLabel }),
        ...(dataTestId !== undefined && { "data-testid": dataTestId }),
        class: `outline-none px-5 py-4 ${proseClass}`,
        style: `min-height: ${fill ? "100%" : compactMinHeight(layout.rows)}`,
      },
    },
    onCreate: ({ editor: created }) =>
      callbacks.current.onChange(serialized(created)),
    onUpdate: ({ editor: active }) =>
      callbacks.current.onChange(serialized(active)),
    onFocus: () => callbacks.current.onFocusChange?.(true),
    onBlur: () => {
      callbacks.current.onFocusChange?.(false);
      callbacks.current.onBlur();
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    if (serialized(editor) === content) return;
    editor.commands.setContent(content, { emitUpdate: false });
    callbacks.current.onChange(serialized(editor));
  }, [content, editor, callbacks]);

  const empty = editor?.isEmpty ?? content.length === 0;

  return (
    <div className={cardClass(fill)}>
      {!readOnly && editor ? (
        <MarkdownToolbar editor={editor} trailing={statusSlot} />
      ) : null}
      <div className={cn("relative", fill && "min-h-0 flex-1 overflow-y-auto")}>
        {!readOnly && empty ? (
          <ExampleOverlay placeholder={placeholder} />
        ) : null}
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
