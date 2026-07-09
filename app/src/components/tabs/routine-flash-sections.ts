import type {
  RoutineEditorSection,
  RoutineFormData,
} from "@houston-ai/routines";

/**
 * Which editor sections an external routine change touched — feeds the
 * "the agent just changed this" flash (RoutineEditor's `flash` prop). Compares
 * the editor's previous synced form against the fresh one, so only fields the
 * user can actually SEE light up:
 *
 *  - name / prompt → the hero card ("details")
 *  - schedule → the "When it runs" card
 *  - notify + chat-mode toggles and the model/effort pin → the Behavior card
 *
 * `integrations` is deliberately unmapped: the editor renders no integrations
 * row, and flashing an unrelated section would mis-attribute the change.
 * Pure and type-only in its imports, so the bare node test runner loads it.
 */
export function changedEditorSections(
  prev: RoutineFormData,
  next: RoutineFormData,
): RoutineEditorSection[] {
  const sections: RoutineEditorSection[] = [];
  if (prev.name !== next.name || prev.prompt !== next.prompt) {
    sections.push("details");
  }
  if (prev.schedule !== next.schedule) sections.push("schedule");
  if (
    prev.suppress_when_silent !== next.suppress_when_silent ||
    prev.chat_mode !== next.chat_mode ||
    (prev.provider ?? null) !== (next.provider ?? null) ||
    (prev.model ?? null) !== (next.model ?? null) ||
    (prev.effort ?? null) !== (next.effort ?? null)
  ) {
    sections.push("behavior");
  }
  return sections;
}
