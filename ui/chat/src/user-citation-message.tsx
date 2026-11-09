import { cn } from "@houston-ai/core";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { type CitationChipData, CitationNumber } from "./citation-chips";

export interface UserCitationMessageProps {
  /** The comments per file, each file named once above its own. */
  groups: readonly {
    filePath: string;
    fileName: string;
    citations: readonly CitationChipData[];
  }[];
  /** The typed words (and anything else the message carried) below them. */
  children?: ReactNode;
  /** Opens the file at a comment's page. */
  onOpen?: (id: string) => void;
  noCommentLabel?: string;
  openLabel?: (chip: CitationChipData) => string;
}

/**
 * A sent message that carried file comments: the user's own bubble, with a
 * compact pill per comment above the typed words. The model-facing list the
 * agent read never shows.
 */
export function UserCitationMessage({
  groups,
  children,
  onOpen,
  noCommentLabel = "No comment",
  openLabel,
}: UserCitationMessageProps) {
  return (
    <div className="ml-auto flex w-fit max-w-[min(32.5rem,88%)] flex-col gap-2 rounded-[22px] bg-bubble px-3 py-2.5 text-base leading-6 font-medium text-bubble-text">
      {groups.map((group) => (
        <div key={group.filePath} className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 px-1 text-xs font-normal text-bubble-chip-text">
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{group.fileName}</span>
          </p>
          <ul className="flex flex-col gap-1.5">
            {group.citations.map((chip) => {
              const body = (
                <>
                  <CitationNumber
                    n={chip.n}
                    className="size-4.5 bg-bubble-text text-bubble ring-0"
                  />
                  {chip.thumbnailSrc && (
                    <img
                      alt=""
                      src={chip.thumbnailSrc}
                      className="h-7 w-11 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span
                      className={cn(
                        "truncate text-[13px] leading-[18px]",
                        !chip.comment && "opacity-75",
                      )}
                    >
                      {chip.comment || noCommentLabel}
                    </span>
                    <span className="truncate text-xs leading-4 font-normal opacity-75">
                      {chip.context}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={chip.id}>
                  {onOpen ? (
                    <button
                      type="button"
                      onClick={() => onOpen(chip.id)}
                      aria-label={openLabel?.(chip)}
                      className="citation-press flex w-full items-center gap-2.5 rounded-xl bg-bubble-chip py-1.5 pr-2.5 pl-1.5 text-bubble-chip-text outline-none focus-visible:ring-2 focus-visible:ring-bubble-text"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-xl bg-bubble-chip py-1.5 pr-2.5 pl-1.5 text-bubble-chip-text">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {children && <div className="px-1">{children}</div>}
    </div>
  );
}
