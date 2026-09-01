/**
 * The rendered body of `FilePreviewDialog` — everything inside the dialog's
 * scroll frame, split out so the dialog file stays a thin shell (load the
 * bytes, size the surface, offer Download).
 *
 * Markdown gets the real treatment (PRODUCT-1231): a `.md` a user opens from
 * chat is the DELIVERABLE the agent just wrote, so it renders as formatted
 * prose through the same Streamdown pipeline chat itself uses, not as raw
 * source in a monospace block. Every other text-ish file still shows verbatim.
 *
 * Nothing here may push the modal wider than its max-width. Long words and
 * URLs wrap at character boundaries, code blocks and tables scroll inside
 * their own frames (Streamdown wraps both), and the whole frame clips.
 */
import { MessageResponse } from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/** The bytes-loading state machine `FilePreviewDialog` drives. */
export type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "image" | "pdf" | "html"; url: string; blob: Blob }
  | { state: "text"; text: string; blob: Blob }
  | { state: "binary"; blob: Blob };

/** Files whose text is prose to be rendered, not source to be read. */
export function isMarkdownFile(fileName: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(fileName);
}

/**
 * Markdown retuned for a document surface rather than a chat bubble: full
 * heading scale (this IS a document, so h1 may tower), and hard wrapping so a
 * pasted URL or a 200-character token can't widen the dialog. `min-w-0` keeps
 * the prose column from taking its widest child as a floor.
 */
const PREVIEW_MARKDOWN = [
  "min-w-0 max-w-none p-5 text-sm leading-relaxed break-words",
  "[&_:is(pre,code)]:whitespace-pre-wrap [&_:is(pre,code)]:break-words",
  "[&_img]:max-w-full [&_img]:h-auto",
].join(" ");

interface Props {
  loaded: Loaded;
  fileName: string;
  /** Full-viewport layout — an HTML deck, or any file the reader expanded:
   *  media fills its row instead of capping at a fraction of the viewport. */
  fullPage: boolean;
  /** Opens a link the previewed markdown contains — a URL in the system
   *  browser, a sibling file in this same dialog. Without it Streamdown's
   *  default `<a>` would navigate the whole app away inside the webview. */
  onOpenLink: (href: string) => void;
}

export function FilePreviewBody({
  loaded,
  fileName,
  fullPage,
  onOpenLink,
}: Props) {
  const { t } = useTranslation("agents");

  switch (loaded.state) {
    case "loading":
      return (
        <p className="p-6 text-sm text-ink-muted">
          {t("files.preview.loading")}
        </p>
      );
    case "error":
      return (
        <div className="space-y-1 p-6">
          <p className="text-sm font-medium">{t("files.preview.errorTitle")}</p>
          <p className="text-sm text-ink-muted break-words">{loaded.message}</p>
        </div>
      );
    case "image":
      return (
        <img
          src={loaded.url}
          alt={fileName}
          className={cn(
            "mx-auto max-w-full object-contain",
            fullPage ? "max-h-full" : "max-h-[58dvh]",
          )}
        />
      );
    case "pdf":
      return (
        <iframe
          src={loaded.url}
          title={fileName}
          className={cn("w-full border-0", fullPage ? "h-full" : "h-[58dvh]")}
        />
      );
    case "html":
      // `allow-scripts` WITHOUT `allow-same-origin`: decks need their JS,
      // but a workspace file must never reach the app's origin, storage or
      // session. The blob document runs in an opaque origin. bg-white mirrors
      // the browser's default page canvas (iframes are otherwise transparent,
      // and an unstyled page over the dialog's dark surface would be
      // unreadable).
      return (
        <iframe
          src={loaded.url}
          title={fileName}
          sandbox="allow-scripts"
          className={cn(
            "w-full border-0 bg-white",
            fullPage ? "h-full" : "h-[58dvh]",
          )}
        />
      );
    case "text":
      return isMarkdownFile(fileName) ? (
        // No `renderLink` override: the shared defaults are already right
        // here. A URL is the inline Autolink chip (HOU-1152 retired the button
        // pill that once made a labeled link a black slab mid-paragraph), and
        // a workspace file is the file chip — so a document names its files
        // exactly the way chat does.
        <MessageResponse className={PREVIEW_MARKDOWN} onOpenLink={onOpenLink}>
          {loaded.text}
        </MessageResponse>
      ) : (
        <pre className="p-4 text-xs whitespace-pre-wrap break-words">
          {loaded.text}
        </pre>
      );
    case "binary":
      return (
        <p className="p-6 text-sm text-ink-muted">
          {t("files.preview.unsupportedTitle")}
        </p>
      );
  }
}
