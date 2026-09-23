import { Button, cn, Skeleton, Textarea } from "@houston-ai/core";
import { SkillWorkflowSteps } from "@houston-ai/skills";
import { useTranslation } from "react-i18next";
import type { SkillWorkflowStep } from "../../lib/types";
import { SkillStepIntegrationChip } from "../integrations";
import type { SkillEditorView } from "./skill-editor-model";
import { SkillsRetryEmpty } from "./skills-list-states";
import type { SkillEditorState } from "./use-skill-editor";

/**
 * A skill's body. A skill Houston wrote carries a numbered workflow — the
 * thing a non-technical owner checks — and an imported one carries only its
 * markdown, which then IS the skill. One reading at a time, switched from the
 * editor's header, with the states a full page owes: a skeleton while SKILL.md
 * lands, the load failure, and the notice that the chat rewrote the file under
 * an unsaved draft.
 */

/** `dvh`, never `vh`: the phone's collapsing browser chrome would size the
 *  editor against a viewport that is not there. It grows past the minimum with
 *  the content (`field-sizing-content` on the base). */
const EDITOR_SIZE = "min-h-[50dvh] md:min-h-[60dvh]";

function MarkdownEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (content: string) => void;
}) {
  const { t } = useTranslation("skills");
  return (
    <Textarea
      value={content}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("detail.instructionsLabel")}
      placeholder={t("detail.instructionsPlaceholder")}
      // No size class: the base is 16px on phones (never zooms the viewport on
      // focus) and 14px from md up.
      className={cn("resize-none font-mono", EDITOR_SIZE)}
    />
  );
}

function WorkflowPanel({ steps }: { steps: SkillWorkflowStep[] }) {
  const { t } = useTranslation("skills");
  return (
    <SkillWorkflowSteps
      steps={steps}
      renderIntegration={(integration) => (
        <SkillStepIntegrationChip integration={integration} />
      )}
      labels={{ heading: t("detail.workflowHeading") }}
    />
  );
}

export function SkillBodyEditor({
  view,
  onViewChange,
  editor,
}: {
  view: SkillEditorView;
  onViewChange: (view: SkillEditorView) => void;
  editor: SkillEditorState;
}) {
  const { t } = useTranslation("skills");
  const { draft, detail, error } = editor;

  if (error && !detail)
    return (
      <SkillsRetryEmpty
        title={t("detail.loadFailed")}
        description={t("detail.loadFailedDescription")}
        onRetry={editor.retryLoad}
      />
    );
  if (!draft)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );

  const steps = detail?.workflow?.steps ?? [];
  if (view === "workflow")
    return steps.length > 0 ? (
      <WorkflowPanel steps={steps} />
    ) : (
      <div className="flex flex-col items-start gap-2 rounded-xl bg-chip-subtle px-4 py-5">
        <p className="font-medium text-ink text-sm">
          {t("editor.noWorkflowTitle")}
        </p>
        <p className="text-ink-muted text-sm">{t("editor.noWorkflowBody")}</p>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => onViewChange("text")}
        >
          {t("editor.switchToText")}
        </Button>
      </div>
    );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {draft.stale && (
        <p className="text-ink-muted text-xs">
          {t("editor.updatedInChat")}{" "}
          <button
            type="button"
            onClick={editor.reload}
            className="cursor-pointer rounded-sm text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {t("editor.reload")}
          </button>
        </p>
      )}
      <MarkdownEditor content={draft.text} onChange={editor.setText} />
    </div>
  );
}
