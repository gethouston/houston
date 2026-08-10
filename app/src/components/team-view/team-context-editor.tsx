import { CatalogSectionHeader } from "@houston-ai/core";
import { ContextEditorBox } from "../context/context-editor";

export interface TeamContextEditorLabels {
  title: string;
  explainer: string;
  placeholder: string;
}

/**
 * The team's shared context, as the first card of its Manage agents page: what
 * every agent of this team is told before it starts a turn.
 *
 * The editor is the ONE standing-prose box (`ContextEditorBox` — always open,
 * saves on blur, says so quietly), under a card-scale header rather than a
 * page hero: this is a card among the page's other cards, not a page of its
 * own, so it wears its siblings' `CatalogSectionHeader` and keeps the shared
 * explain-ONCE rule with its own one-line explainer.
 *
 * Presentational and props-only: WHERE the content is stored (the sidebar
 * group, the layout's default-team field, the gateway) is
 * `team-context-model.ts`'s question
 * and the wired branches in `team-context-card.tsx` answer it. This file never
 * learns which backend it is drawing.
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
    <section className="mb-10">
      <CatalogSectionHeader title={labels.title} />
      <p className="mt-1 text-sm text-ink-muted">{labels.explainer}</p>
      <ContextEditorBox
        content={content}
        onSave={onSave}
        readOnly={readOnly}
        placeholder={labels.placeholder}
        minRows={6}
        ariaLabel={labels.title}
        dataTestId="team-context-input"
      />
    </section>
  );
}
