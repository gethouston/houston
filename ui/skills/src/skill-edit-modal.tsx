import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { AlertCircle } from "lucide-react";
import { useCallback, useState } from "react";
import type { InstalledSkillEditorState } from "./installed-skill-editor-model";

export interface SkillEditModalLabels {
  save?: string;
  saving?: string;
  cancel?: string;
  /** The destructive footer action; only rendered when `onDelete` is wired. */
  delete?: string;
  editorPlaceholder?: string;
  loadFailed?: string;
}

const DEFAULT_LABELS: Required<SkillEditModalLabels> = {
  save: "Save changes",
  saving: "Saving...",
  cancel: "Cancel",
  delete: "Delete skill",
  editorPlaceholder: "Instructions for this skill...",
  loadFailed: "Couldn't load this skill's instructions.",
};

const SKELETON_LINES = [
  { key: "a", width: "w-full" },
  { key: "b", width: "w-11/12" },
  { key: "c", width: "w-full" },
  { key: "d", width: "w-4/5" },
  { key: "e", width: "w-2/3" },
];

export interface SkillEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Localized display title, shown as the dialog title. */
  displayName: string;
  /** One-line skill description, shown muted under the title (may be empty). */
  description: string;
  editor: InstalledSkillEditorState;
  onSave: (content: string) => Promise<void>;
  /** Open the delete confirm (the strip has no per-tile delete affordance, so
   *  the destructive action lives here). Omit to hide the button. */
  onDelete?: () => void;
  labels?: SkillEditModalLabels;
}

/**
 * SkillEditModal — the overlay editor for an installed skill, mirroring
 * {@link SkillPreviewModal}. The header shows the skill's display name plus a
 * muted one-line description; the body holds the editor content states (loading
 * skeleton, a non-blocking load-error note, or a roomy monospace textarea seeded
 * from the loaded markdown); the footer carries Cancel (ghost) and Save changes
 * (primary pill, disabled until dirty, "Saving..." while in flight). A
 * successful save closes the modal from the parent (clearing the editing skill);
 * a save rejection propagates to the caller's toast path (never swallowed).
 */
export function SkillEditModal({
  open,
  onOpenChange,
  displayName,
  description,
  editor,
  onSave,
  onDelete,
  labels,
}: SkillEditModalProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {/* min-w-0: DialogContent is a grid; without it this item's min-content
            width (a long nowrap line) blows the track past the dialog's
            max-width and drags the textarea with it. */}
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate">{displayName}</DialogTitle>
          {description && (
            <DialogDescription className="line-clamp-2">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {editor.status === "ready" ? (
          <ReadyEditBody
            initial={editor.content}
            onSave={onSave}
            onCancel={close}
            onDelete={onDelete}
            labels={l}
          />
        ) : (
          <NonReadyBody
            status={editor.status}
            onCancel={close}
            onDelete={onDelete}
            labels={l}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The loading-skeleton / load-error body, with a footer whose Save is inert. */
function NonReadyBody({
  status,
  onCancel,
  onDelete,
  labels: l,
}: {
  status: InstalledSkillEditorState["status"];
  onCancel: () => void;
  onDelete?: () => void;
  labels: Required<SkillEditModalLabels>;
}) {
  return (
    <>
      {status === "error" ? (
        <div className="flex items-start gap-2 text-sm text-ink-muted">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{l.loadFailed}</span>
        </div>
      ) : (
        <div className="h-80 space-y-2">
          {SKELETON_LINES.map((line) => (
            <div
              key={line.key}
              className={cn("h-3 animate-pulse rounded bg-chip", line.width)}
            />
          ))}
        </div>
      )}
      <DialogFooter>
        <FooterButtons onCancel={onCancel} onDelete={onDelete} labels={l} />
      </DialogFooter>
    </>
  );
}

/** The seeded textarea + a footer whose Save commits the draft. */
function ReadyEditBody({
  initial,
  onSave,
  onCancel,
  onDelete,
  labels: l,
}: {
  initial: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  labels: Required<SkillEditModalLabels>;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== initial;

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, onSave, draft]);

  return (
    <>
      <textarea
        // biome-ignore lint/a11y/noAutofocus: focusing the editor on open is the intended UX for an edit modal.
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={l.editorPlaceholder}
        className={cn(
          "h-80 w-full resize-none overflow-y-auto rounded-lg border border-line/20 bg-input px-4 py-3",
          "font-mono text-sm leading-relaxed text-ink",
          "placeholder:text-ink-muted/60",
          "outline-none transition-shadow duration-200 focus:shadow-sm",
        )}
      />
      <DialogFooter>
        <FooterButtons
          onCancel={onCancel}
          onSave={handleSave}
          onDelete={onDelete}
          dirty={dirty}
          saving={saving}
          labels={l}
        />
      </DialogFooter>
    </>
  );
}

function FooterButtons({
  onCancel,
  onSave,
  onDelete,
  dirty = false,
  saving = false,
  labels: l,
}: {
  onCancel: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  dirty?: boolean;
  saving?: boolean;
  labels: Required<SkillEditModalLabels>;
}) {
  const disabled = !dirty || saving || !onSave;
  return (
    <>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="mr-auto inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          {l.delete}
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:opacity-60"
      >
        {l.cancel}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className={cn(
          "inline-flex h-9 items-center rounded-full bg-action px-5 text-sm font-medium text-action-text transition-colors hover:bg-action/90",
          disabled && "opacity-60",
          saving && "cursor-wait",
        )}
      >
        {saving ? l.saving : l.save}
      </button>
    </>
  );
}
