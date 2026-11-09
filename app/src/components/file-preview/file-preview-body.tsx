/**
 * The preview panel's body for everything that is not paged: images, HTML,
 * markdown and other text. Paged documents (PDFs and converted Office files)
 * go to `PdfPreview`; loading, failure and "no preview" states are the
 * panel's own (`preview-states.tsx`).
 *
 * Markdown gets the real treatment (PRODUCT-1231): a `.md` a user opens from
 * chat is the DELIVERABLE the agent just wrote, so it renders as formatted
 * prose through the same Streamdown pipeline chat itself uses, not as raw
 * source in a monospace block. Every other text-ish file shows verbatim.
 *
 * Nothing here may push the panel wider than itself. Long words and URLs wrap
 * at character boundaries, code blocks and tables scroll inside their own
 * frames (Streamdown wraps both), and the frame clips.
 */
import { MessageResponse } from "@houston-ai/chat";

/** The bytes-loading state machine `useFilePreviewLoad` drives. */
export type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "image" | "html"; url: string; blob: Blob }
  /** `data` is what the pages render; `blob` the original, when the two are
   *  the same file (an Office file's original downloads on demand). */
  | { state: "pdf"; data: Blob; blob?: Blob }
  | { state: "text"; text: string; blob: Blob }
  | { state: "binary"; blob?: Blob };

export type ContentLoaded = Extract<
  Loaded,
  { state: "image" | "html" | "text" }
>;

/** Files whose text is prose to be rendered, not source to be read. */
export function isMarkdownFile(fileName: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(fileName);
}

/**
 * Markdown retuned for a document surface rather than a chat bubble: full
 * heading scale, and hard wrapping so a pasted URL or a 200-character token
 * can't widen the panel. `min-w-0` keeps the prose column from taking its
 * widest child as a floor.
 */
const PREVIEW_MARKDOWN = [
  "mx-auto min-w-0 max-w-3xl px-6 py-5 text-sm leading-relaxed break-words",
  "[&_:is(pre,code)]:whitespace-pre-wrap [&_:is(pre,code)]:break-words",
  "[&_img]:max-w-full [&_img]:h-auto",
].join(" ");

interface Props {
  loaded: ContentLoaded;
  fileName: string;
  /** Opens a link the previewed markdown contains: a URL in the system
   *  browser, a sibling file in this same panel. Without it Streamdown's
   *  default `<a>` would navigate the whole app away inside the webview. */
  onOpenLink: (href: string) => void;
}

export function FilePreviewBody({ loaded, fileName, onOpenLink }: Props) {
  switch (loaded.state) {
    case "image":
      return (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-gutter p-4">
          <img
            src={loaded.url}
            alt={fileName}
            className="max-h-full max-w-full rounded-lg object-contain ht-hairline"
          />
        </div>
      );
    case "html":
      // `allow-scripts` WITHOUT `allow-same-origin`: decks need their JS,
      // but a workspace file must never reach the app's origin, storage or
      // session. The blob document runs in an opaque origin. bg-white mirrors
      // the browser's default page canvas (iframes are otherwise transparent).
      return (
        <iframe
          src={loaded.url}
          title={fileName}
          sandbox="allow-scripts"
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      );
    case "text":
      return (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {isMarkdownFile(fileName) ? (
            // No `renderLink` override: a URL is the inline Autolink chip and
            // a workspace file the file chip, so a document names its files
            // exactly the way chat does.
            <MessageResponse
              className={PREVIEW_MARKDOWN}
              onOpenLink={onOpenLink}
            >
              {loaded.text}
            </MessageResponse>
          ) : (
            <pre className="p-4 text-xs whitespace-pre-wrap break-words">
              {loaded.text}
            </pre>
          )}
        </div>
      );
  }
}
