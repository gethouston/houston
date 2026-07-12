import { Button, cn } from "@houston-ai/core";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { learningNeedsExpansion } from "../../lib/learning-preview";
import { LearningPreview } from "./learning-card-preview";

export function LearningCard({
  initialText,
  onSave,
  onDelete,
  onCancel,
  isDraft,
  readOnly = false,
}: {
  initialText: string;
  onSave: (text: string) => Promise<unknown> | unknown;
  onDelete?: () => void;
  onCancel?: () => void;
  isDraft?: boolean;
  /** Managed-agent read-only: preview only, no edit/delete affordances. */
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initialText);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(Boolean(isDraft));
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canExpand = learningNeedsExpansion(initialText);

  useEffect(() => {
    setValue(initialText);
  }, [initialText]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setExpanded(true);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      if (isDraft) onCancel?.();
      else setValue(initialText);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (trimmed !== initialText) await onSave(trimmed);
      setEditing(false);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (isDraft) onCancel?.();
    setValue(initialText);
    setEditing(false);
  };

  return (
    <article className="rounded-xl border border-ink/[0.05] bg-chip px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      {editing && !readOnly ? (
        <LearningEditor
          value={value}
          saving={saving}
          isDraft={isDraft}
          textareaRef={textareaRef}
          onCancel={cancel}
          onChange={setValue}
          onSave={() => void save()}
        />
      ) : (
        <LearningPreview
          text={initialText}
          expanded={expanded}
          canExpand={canExpand}
          onToggle={() => setExpanded((next) => !next)}
          onEdit={readOnly ? undefined : startEditing}
          onDelete={readOnly ? undefined : onDelete}
        />
      )}
    </article>
  );
}

function LearningEditor({
  value,
  saving,
  isDraft,
  textareaRef,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  saving: boolean;
  isDraft?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["agents", "common"]);
  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={isDraft ? t("agents:learnings.inputPlaceholder") : ""}
        rows={Math.max(4, value.split("\n").length + 1)}
        className={cn(
          "w-full resize-none rounded-lg border border-ink/[0.08] bg-input",
          "px-3 py-2 text-sm leading-relaxed text-ink outline-none",
          "placeholder:text-ink-muted/60 focus:border-ink/20",
        )}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="size-3.5" />
          {t("common:actions.cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || !value.trim()}>
          <Check className="size-3.5" />
          {saving ? t("common:actions.saving") : t("common:actions.save")}
        </Button>
      </div>
    </div>
  );
}
