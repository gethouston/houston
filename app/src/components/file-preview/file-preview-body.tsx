import { MessageResponse } from "@houston-ai/chat";

export type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "image" | "html"; url: string; blob: Blob }
  | { state: "pdf"; data: Blob; blob?: Blob }
  | { state: "text"; text: string; blob: Blob }
  | { state: "binary"; blob?: Blob };

export type ContentLoaded = Extract<
  Loaded,
  { state: "image" | "html" | "text" }
>;

export function isMarkdownFile(fileName: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx)$/i.test(fileName);
}

const PREVIEW_MARKDOWN = [
  "mx-auto min-w-0 max-w-3xl px-6 py-5 text-sm leading-relaxed break-words",
  "[&_:is(pre,code)]:whitespace-pre-wrap [&_:is(pre,code)]:break-words",
  "[&_img]:max-w-full [&_img]:h-auto",
].join(" ");

interface Props {
  loaded: ContentLoaded;
  fileName: string;
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
