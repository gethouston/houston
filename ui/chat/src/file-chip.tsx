/**
 * A workspace FILE named inline in an agent's prose (PRODUCT-1231).
 *
 * Chat used to render file references with the WEB link vocabulary, in two
 * different shapes depending on how the agent happened to write the markdown:
 * `[Perfil](perfil.md)` became a filled black button pill with an
 * external-link arrow, while `[plan.md](plan.md)` became the blue autolink
 * chip with a chain glyph. One action, two looks — and both of them lying,
 * because `↗` means "leaves the app" and a workspace file opens a preview
 * INSIDE it (or hands off to the OS on a co-located desktop).
 *
 * So a file gets the file vocabulary instead, the same one the file browser and
 * the turn summary already use: the per-extension glyph tinted with its
 * reserved `filetype.*` token, on the recessed chip surface. Two consequences
 * worth keeping:
 *
 *   - `text-link` blue stays reserved for the web (DESIGN.md: "the ONE
 *     sanctioned blue"). Blue now means "this leaves Houston", a neutral chip
 *     means "this is yours" — a distinction the reader could not make before.
 *   - The same file looks like the same file everywhere in the app. A `.pdf`
 *     and a `.xlsx` named in one sentence read apart at a glance, exactly as
 *     they do in a file listing.
 */

import { cn, FileTypeGlyphInline } from "@houston-ai/core";
import type { ReactNode } from "react";
import { extensionOf } from "./file-path";

/**
 * Chip surface. Sized to the surrounding text (`align-[-3px]` sits the box on
 * the baseline rather than letting it ride high), and `[overflow-wrap:anywhere]`
 * lets a long name break instead of pushing the bubble wide.
 */
const FILE_CHIP_CLASS = cn(
  "inline-flex max-w-full items-center gap-1.5 align-[-3px]",
  "rounded border border-line bg-chip px-1.5 py-0.5 text-ink",
  "transition-colors duration-200 hover:bg-hover",
  "[overflow-wrap:anywhere]",
);

export interface FileChipProps {
  /** Workspace-relative path — the tooltip, and what picks the type glyph. */
  path: string;
  /** Opens the file (in-app preview, or the OS on a co-located desktop). */
  onOpen: () => void;
  /** The agent's own label, or the file name when it wrote the path as the
   *  label. The glyph already says "file", so the text is free to read as
   *  prose. */
  children: ReactNode;
}

export function FileChip({ path, onOpen, children }: FileChipProps) {
  return (
    <button
      type="button"
      title={path}
      className={FILE_CHIP_CLASS}
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <FileTypeGlyphInline extension={extensionOf(path)} />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
