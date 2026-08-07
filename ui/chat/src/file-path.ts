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
