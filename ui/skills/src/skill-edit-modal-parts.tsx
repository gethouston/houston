import { cn, DialogFooter } from "@houston-ai/core";
import { AlertCircle } from "lucide-react";
import { useCallback, useState } from "react";
import type { InstalledSkillEditorState } from "./installed-skill-editor-model";
import type { SkillEditModalLabels } from "./skill-edit-modal-labels";

/**
 * The body + footer states of {@link SkillEditModal}, split out so the modal
 * itself stays a thin composition. Nothing here is exported from the package:
 * the modal is the one public surface.
 */

type Labels = Required<SkillEditModalLabels>;

const SKELETON_LINES = [
  { key: "a", width: "w-full" },
  { key: "b", width: "w-11/12" },
  { key: "c", width: "w-full" },
  { key: "d", width: "w-4/5" },
  { key: "e", width: "w-2/3" },
];

/** The loading-skeleton / load-error body, with a footer whose Save is inert. */
export function NonReadyBody({
  status,
  onCancel,
  onDelete,
  labels: l,
}: {
  status: InstalledSkillEditorState["status"];
  onCancel: () => void;
  onDelete?: () => void;
  labels: Labels;
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
export function ReadyEditBody({
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
  labels: Labels;
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
  labels: Labels;
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
