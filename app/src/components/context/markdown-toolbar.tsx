import { Button } from "@houston-ai/core";
import { type Editor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  TextQuote,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * The standing-prose editor's formatting bar: always visible (never behind
 * hover or a selection popup), because the people writing here don't know
 * markdown exists and never will. One quiet row of ghost icon buttons on the
 * document card's top edge; the typing shortcuts keep working underneath for
 * whoever knows them.
 *
 * `onMouseDown` preventDefault on every button keeps focus and the selection
 * INSIDE the document, so toggling a style never blurs the editor (which
 * would fire the save) and never loses what the user selected.
 */
export function MarkdownToolbar({
  editor,
  trailing,
}: {
  editor: Editor;
  /** Right-aligned status seat (the quiet Saving…/Saved), clear of the text. */
  trailing?: ReactNode;
}) {
  const { t } = useTranslation("context");
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: e.isActive("heading", { level: 1 }),
      subheading: e.isActive("heading", { level: 2 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bulletList: e.isActive("bulletList"),
      numberedList: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
    }),
  });

  const chain = () => editor.chain().focus();
  const controls = [
    {
      key: "heading",
      icon: Heading1,
      run: () => chain().toggleHeading({ level: 1 }).run(),
    },
    {
      key: "subheading",
      icon: Heading2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    { key: "bold", icon: Bold, run: () => chain().toggleBold().run() },
    { key: "italic", icon: Italic, run: () => chain().toggleItalic().run() },
    {
      key: "bulletList",
      icon: List,
      run: () => chain().toggleBulletList().run(),
    },
    {
      key: "numberedList",
      icon: ListOrdered,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      key: "quote",
      icon: TextQuote,
      run: () => chain().toggleBlockquote().run(),
    },
  ] as const;

  return (
    // A labelled fieldset, not role="toolbar": that role promises the
    // roving-tabindex arrow-key pattern, and seven honest tab stops beat a
    // half-implemented widget contract.
    <fieldset
      aria-label={t("editor.toolbar.label")}
      className="flex items-center gap-0.5 border-b border-line px-2 py-1.5"
    >
      {controls.map(({ key, icon: Icon, run }) => (
        <Button
          key={key}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t(`editor.toolbar.${key}`)}
          aria-pressed={active[key]}
          // The pressed fill carries its own hover counterpart: the ghost
          // variant's hover:bg-hover would otherwise outrank it and blank
          // the active state exactly while the pointer is on it.
          className={
            active[key]
              ? "bg-chip text-ink hover:bg-chip hover:text-ink"
              : "text-ink-muted"
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={run}
        >
          <Icon className="size-4" />
        </Button>
      ))}
      {trailing ? <div className="ml-auto pr-1.5">{trailing}</div> : null}
    </fieldset>
  );
}
