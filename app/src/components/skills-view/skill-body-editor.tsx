import { Button, cn, Skeleton, Textarea } from "@houston-ai/core";
import {
  SkillInstructionsDisclosure,
  SkillWorkflowSteps,
} from "@houston-ai/skills";
import { useTranslation } from "react-i18next";
import type { SkillWorkflow, SkillWorkflowStep } from "../../lib/types";
import { SkillStepIntegrationChip } from "../integrations";
import type { SkillEditorView } from "./skill-editor-model";
import type { SkillEditorState } from "./use-skill-editor";

/**
 * A skill's body, on either surface that reads one. A skill Houston wrote
 * carries a numbered workflow — the thing a non-technical owner checks — and
 * an imported one carries only its markdown, which then IS the skill.
 *
 * The surfaces differ in how much room they have, which is the whole of
 * `variant`. The DIALOG shares a fixed frame with the assignment list below
 * it, so it shows both readings at once: the steps, with the markdown behind
 * an always-visible disclosure. The PAGE owns the screen beside the skill's
 * chat, so it shows one reading at a time, switched from its header, and can
 * afford the states a full page owes: a skeleton while SKILL.md lands, the
 * load failure, and the notice that the chat rewrote the file under an
 * unsaved draft.
 */
export type SkillBodySurface = "dialog" | "page";

/** Sizing is the only visual value the surface changes. `dvh`, never `vh`: the
 *  phone's collapsing browser chrome would size the page editor against a
 *  viewport that is not there. Both grow past the minimum with the content
 *  (`field-sizing-content` on the base). */
const EDITOR_SIZE: Record<SkillBodySurface, string> = {
  dialog: "h-64 overflow-y-auto",
  page: "min-h-[50dvh] md:min-h-[60dvh]",
};

function MarkdownEditor({
  variant,
  content,
  onChange,
}: {
  variant: SkillBodySurface;
  content: string;
  onChange: (content: string) => void;
}) {
  const { t } = useTranslation("skills");
  return (
    <Textarea
      value={content}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("addDialog.scratch.bodyLabel")}
      placeholder={t("detail.instructionsPlaceholder")}
      className={cn("resize-none font-mono text-sm", EDITOR_SIZE[variant])}
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

export type SkillBodyEditorProps =
  | {
      variant: "dialog";
      /** The full SKILL.md (frontmatter + body) being edited. */
      content: string;
      workflow?: SkillWorkflow | null;
      onChange: (content: string) => void;
    }
  | {
      variant: "page";
      view: SkillEditorView;
      onViewChange: (view: SkillEditorView) => void;
      editor: SkillEditorState;
    };

export function SkillBodyEditor(props: SkillBodyEditorProps) {
  return props.variant === "dialog" ? (
    <DialogBody {...props} />
  ) : (
    <PageBody {...props} />
  );
}

function DialogBody({
  content,
  workflow,
  onChange,
}: Extract<SkillBodyEditorProps, { variant: "dialog" }>) {
  const { t } = useTranslation("skills");
  const steps = workflow?.steps ?? [];
  const editor = (
    <MarkdownEditor variant="dialog" content={content} onChange={onChange} />
  );

  if (steps.length === 0) return editor;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <WorkflowPanel steps={steps} />
      <SkillInstructionsDisclosure
        labels={{
          show: t("detail.showInstructions"),
          hide: t("detail.hideInstructions"),
        }}
      >
        {editor}
      </SkillInstructionsDisclosure>
    </div>
  );
}

function PageBody({
  view,
  onViewChange,
  editor,
}: Extract<SkillBodyEditorProps, { variant: "page" }>) {
  const { t } = useTranslation("skills");
  const { draft, detail, error } = editor;

  if (error && !detail)
    return <p className="text-ink-muted text-sm">{t("detail.loadFailed")}</p>;
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
            className="cursor-pointer text-link underline-offset-2 hover:underline"
          >
            {t("editor.reload")}
          </button>
        </p>
      )}
      <MarkdownEditor
        variant="page"
        content={draft.text}
        onChange={editor.setText}
      />
    </div>
  );
}
