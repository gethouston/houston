import { ContextEditorPage } from "../context/context-editor";

export interface TeamContextEditorLabels {
  title: string;
  explainer: string;
  placeholder: string;
}

/**
 * The team's shared context, as the agent settings screen's own pane: what
 * every agent of this team is told before it starts a turn.
 *
 * Drawn as the ONE standing-context PAGE ({@link ContextEditorPage}: hero +
 * pinned document card, the same surface About me and Admin's Company context
 * wear). The hero is `level` 2 because the screen's `<h1>` is the header's
 * identity lozenge, and the card takes the pane's remaining height so a long
 * context scrolls inside it.
 *
 * Presentational and props-only: WHERE the content is stored (the sidebar
 * group, the layout's default-team field, the gateway) is
 * `team-context-model.ts`'s question and the wired branches in
 * `team-context-card.tsx` answer it. This file never learns which backend it
 * is drawing.
 *
 * The read-only face is the whole card, unlocked-looking but locked: someone who
 * may not edit the team still needs to know what its agents are being told, so
 * the text stays legible rather than being hidden or replaced by a notice.
 */
export function TeamContextEditor({
  content,
  onSave,
  labels,
  readOnly = false,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  labels: TeamContextEditorLabels;
  readOnly?: boolean;
}) {
  return (
    <ContextEditorPage
      level={2}
      title={labels.title}
      subtitle={labels.explainer}
      content={content}
      onSave={onSave}
      readOnly={readOnly}
      placeholder={labels.placeholder}
      dataTestId="team-context-input"
    />
  );
}
