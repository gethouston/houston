import type { SkillSummary } from "../../lib/types";

/**
 * The decisions behind the full-page skill editor, kept pure so they are
 * node-testable without a React tree: which of the two views opens, how an
 * unsaved draft survives the chat rewriting the same SKILL.md underneath it,
 * and which row a skill-chat notification points at.
 */

/** The editor's two reads of one skill. */
export type SkillEditorView = "workflow" | "text";

/**
 * The view to show. A skill Houston wrote opens on its numbered workflow —
 * the thing a non-technical owner actually reads; an imported skill has no
 * parsed workflow, so its markdown IS the skill and opens instead. A view the
 * user (or the chat's "Edit manually") picked always wins.
 */
export function resolveSkillEditorView(
  chosen: SkillEditorView | null,
  hasWorkflow: boolean,
): SkillEditorView {
  if (chosen !== null) return chosen;
  return hasWorkflow ? "workflow" : "text";
}

/** The SKILL.md the user is editing, against the copy it was seeded from. */
export interface SkillDraft {
  /** The server copy this draft started from. */
  baseline: string;
  /** What is in the editor right now. */
  text: string;
  /**
   * The server copy moved while the draft was dirty (the chat on the right
   * rewrote the skill). The draft is kept and the editor offers a reload —
   * silently replacing typed work would be the worse failure.
   */
  stale: boolean;
}

export function seedSkillDraft(content: string): SkillDraft {
  return { baseline: content, text: content, stale: false };
}

export function skillDraftDirty(draft: SkillDraft): boolean {
  return draft.text !== draft.baseline;
}

/**
 * Fold a freshly fetched server copy into the open draft. Untouched drafts
 * simply follow the server (the AI-native rule: an agent's write shows up
 * live). A server copy that already equals what is on screen is the user's own
 * save landing, so it adopts silently. Only a genuine divergence raises the
 * stale flag, and it raises it once — the same object comes back afterwards so
 * a render-time reconcile can never loop.
 */
export function reconcileSkillDraft(
  draft: SkillDraft,
  server: string,
): SkillDraft {
  if (server === draft.baseline) return draft;
  if (server === draft.text) return seedSkillDraft(server);
  if (!skillDraftDirty(draft)) return seedSkillDraft(server);
  return draft.stale ? draft : { ...draft, stale: true };
}

/**
 * The row whose skill owns a setup chat, by that chat's activity id. A
 * skill-finished notification lands on the Skills library carrying only the
 * activity id, and the editor is what has to open for it; the frontmatter's
 * `setup_activity_id` is the skill's own record of which chat built it.
 */
export function skillRowForActivity<T extends { summary: SkillSummary }>(
  rows: readonly T[],
  activityId: string | null,
): T | null {
  if (!activityId) return null;
  return (
    rows.find((row) => row.summary.setup_activity_id === activityId) ?? null
  );
}

/**
 * What a skill-chat notification resolves to against the library's rows.
 * `wait` means nothing to act on YET (no notification, or the rows are still
 * landing); `drop` is the id nothing claims once they have, which must be
 * spent rather than left to hijack the next chat the user opens.
 */
export type PendingSkillActivity<T> =
  | { kind: "wait" }
  | { kind: "open"; row: T }
  | { kind: "drop" };

/**
 * Resolve a one-shot `pendingSkillChatActivityId` against the loaded rows.
 * Pure so the three outcomes are node-testable; the nav hook turns `open` and
 * `drop` into the SAME clear, because the id has to be consumed by whoever
 * resolves it. Leaving it for a chat to clear strands a phone, where the
 * chat does not auto-mount: Back re-runs the effect and the editor reopens.
 */
export function resolvePendingSkillActivity<
  T extends { summary: SkillSummary },
>(input: {
  rows: readonly T[];
  /** False while the skills aggregate is still being read. */
  rowsLoaded: boolean;
  activityId: string | null;
}): PendingSkillActivity<T> {
  if (!input.activityId) return { kind: "wait" };
  const row = skillRowForActivity(input.rows, input.activityId);
  if (row) return { kind: "open", row };
  return input.rowsLoaded ? { kind: "drop" } : { kind: "wait" };
}
