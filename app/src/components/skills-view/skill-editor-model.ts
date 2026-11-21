import type { SkillSummary } from "../../lib/types";

export type SkillEditorView = "workflow" | "text";

export function resolveSkillEditorView(
  chosen: SkillEditorView | null,
  hasWorkflow: boolean,
): SkillEditorView {
  if (chosen !== null) return chosen;
  return hasWorkflow ? "workflow" : "text";
}

export interface SkillDraft {
  baseline: string;
  text: string;
  stale: boolean;
}

export function seedSkillDraft(content: string): SkillDraft {
  return { baseline: content, text: content, stale: false };
}

export function skillDraftDirty(draft: SkillDraft): boolean {
  return draft.text !== draft.baseline;
}

export function reconcileSkillDraft(
  draft: SkillDraft,
  server: string,
): SkillDraft {
  if (server === draft.baseline) return draft;
  if (server === draft.text) return seedSkillDraft(server);
  if (!skillDraftDirty(draft)) return seedSkillDraft(server);
  return draft.stale ? draft : { ...draft, stale: true };
}

export function skillRowForActivity<T extends { summary: SkillSummary }>(
  rows: readonly T[],
  activityId: string | null,
): T | null {
  if (!activityId) return null;
  return (
    rows.find((row) => row.summary.setup_activity_id === activityId) ?? null
  );
}

export type PendingSkillActivity<T> =
  | { kind: "wait" }
  | { kind: "open"; row: T }
  | { kind: "drop" };

export function resolvePendingSkillActivity<
  T extends { summary: SkillSummary },
>(input: {
  rows: readonly T[];
  rowsLoaded: boolean;
  activityId: string | null;
}): PendingSkillActivity<T> {
  if (!input.activityId) return { kind: "wait" };
  const row = skillRowForActivity(input.rows, input.activityId);
  if (row) return { kind: "open", row };
  return input.rowsLoaded ? { kind: "drop" } : { kind: "wait" };
}
