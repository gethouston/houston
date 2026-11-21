import { Button, cn } from "@houston-ai/core";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { learningNeedsExpansion } from "../../lib/learning-preview";
import type { LearningProvenanceView } from "../../lib/learning-provenance";
import { LearningPreview } from "./learning-card-preview";

export function LearningCard({
  initialText,
  provenance,
  onSave,
  onDelete,
  onCancel,
  isDraft,
}: {
  initialText: string;
  provenance?: LearningProvenanceView | null;
  onSave: (text: string) => Promise<boolean> | undefined;
  onDelete?: () => void;
  onCancel?: () => void;
  isDraft?: boolean;
}) {
  const [value, setValue] = useState(initialText);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(Boolean(isDraft));
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canExpand = learningNeedsExpansion(initialText);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setValue(initialText);
    setExpanded(true);
    setEditing(true);
  };

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      if (isDraft) onCancel?.();
      setEditing(false);
      return;
    }
    setEditing(false);
    setExpanded(false);
    if (!isDraft && trimmed === initialText) return;
    void onSave(trimmed)?.then((landed) => {
      if (landed || editingRef.current) return;
      setValue(trimmed);
      setExpanded(true);
      setEditing(true);
    });
  };

  const cancel = () => {
    if (isDraft) onCancel?.();
    setEditing(false);
  };

  return (
    <article className="rounded-xl border border-ink/[0.05] bg-chip px-4 py-3 shadow-edge">
      {editing ? (
        <LearningEditor
          value={value}
          isDraft={isDraft}
          textareaRef={textareaRef}
          onCancel={cancel}
          onChange={setValue}
          onSave={save}
        />
      ) : (
        <LearningPreview
          text={initialText}
          expanded={expanded}
          canExpand={canExpand}
          provenance={provenance}
          onToggle={() => setExpanded((next) => !next)}
          onEdit={startEditing}
          onDelete={onDelete}
        />
      )}
    </article>
  );
}

function LearningEditor({
  value,
  isDraft,
  textareaRef,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
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
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="size-3.5" />
          {t("common:actions.cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!value.trim()}>
          <Check className="size-3.5" />
          {t("common:actions.save")}
        </Button>
      </div>
    </div>
  );
}
