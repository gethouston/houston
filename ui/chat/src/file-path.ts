/**
 * Pure workspace-path helpers for chat's file surfaces. Deliberately a `.ts`
 * module, not part of `file-chip.tsx`: the node:test runner strips types but
 * cannot load `.tsx`, so anything a unit test needs has to live outside a
 * component file.
 *
 * Separator-agnostic throughout — the engine may run on Windows while the
 * viewer is a browser anywhere.
 */

/** Last segment of a path (`a\b\c.md` and `a/b/c.md` → `c.md`). */
export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/**
 * Lowercased extension of a path, or "" when it has none. A leading dot is a
 * dotfile, not an extension (`.gitignore` → ""), which keeps such files on the
 * generic glyph rather than inventing a "gitignore" type.
 */
export function extensionOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * The extension to append to an agent-written chip label so the chip always
 * reads as a file: `[Perfil](perfil.md)` shows "Perfil.md", not "Perfil".
 * Without it the same chip carried an extension or not depending purely on
 * whether the agent happened to write prose or the path as its label — the
 * reader could not tell a `.pdf` from a `.md` from the text.
 *
 * Empty when there is nothing to add: an extensionless file, or a label that
 * already ends in that extension (so a path-shaped label never doubles up).
 */
export function labelExtensionSuffix(path: string, label: string): string {
  const ext = extensionOf(path);
  if (!ext) return "";
  return label.toLowerCase().endsWith(`.${ext}`) ? "" : `.${ext}`;
}
