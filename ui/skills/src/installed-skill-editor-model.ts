/**
 * Pure, JSX-free model for the inline installed-skill editor. Kept in a `.ts`
 * module (no JSX) so the package's `node --experimental-strip-types --test`
 * runner can import it. The editor's markdown content is loaded on first
 * expand via the skill-detail query; this derives the row's editor state from
 * that query without leaking React Query types into `ui/`.
 */

export type InstalledSkillEditorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; content: string }
  | { status: "error" };

/**
 * Derive the editor state a collapsed/expanded installed-skill row should show.
 *
 * - Collapsed → `idle` (no editor rendered, no content fetched).
 * - Expanded with loaded content → `ready` (even mid-refetch, so an
 *   already-open editor never flashes back to skeleton).
 * - Expanded, no content yet, a non-missing load error → `error` (inline,
 *   non-blocking). A *missing*-skill 404 is handled upstream by collapsing the
 *   row and toasting, so `hasError` must exclude it.
 * - Otherwise → `loading` (skeleton while the first fetch is in flight).
 */
export function deriveInstalledSkillEditorState(args: {
  expanded: boolean;
  content: string | undefined;
  hasError: boolean;
}): InstalledSkillEditorState {
  if (!args.expanded) return { status: "idle" };
  if (args.content !== undefined)
    return { status: "ready", content: args.content };
  if (args.hasError) return { status: "error" };
  return { status: "loading" };
}

/** First display-letter for the monogram fallback when a skill has no image. */
export function skillMonogram(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}
