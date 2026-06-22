import {
  Button,
  ConfirmDialog,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LearningCard } from "./learning-card";

export interface LearningEntry {
  index: number;
  text: string;
  id: string;
}

export function LearningsContent({
  entries,
  onAdd,
  onRemove,
  onUpdate,
  layout = "full",
}: {
  entries: LearningEntry[];
  onAdd: (text: string) => Promise<unknown>;
  onRemove: (index: number) => Promise<unknown>;
  onUpdate: (id: string, text: string) => Promise<unknown>;
  layout?: "full" | "section";
}) {
  const { t } = useTranslation("agents");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [pendingRemove, setPendingRemove] = useState<LearningEntry | null>(
    null,
  );
  const draftCounterRef = useRef(0);

  const addDraft = () => {
    draftCounterRef.current += 1;
    setDrafts((prev) => [`draft-${draftCounterRef.current}`, ...prev]);
  };

  const removeDraft = (localId: string) => {
    setDrafts((prev) => prev.filter((id) => id !== localId));
  };

  const handleSaveDraft = async (localId: string, text: string) => {
    await onAdd(text);
    removeDraft(localId);
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return;
    const idx = pendingRemove.index;
    setPendingRemove(null);
    await onRemove(idx);
  };

  if (layout === "full" && entries.length === 0 && drafts.length === 0) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
        <EmptyHeader>
          <EmptyTitle>{t("learnings.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("learnings.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={addDraft}>
          <Plus className="size-4" />
          {t("learnings.addLearning")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        layout === "full" ? "max-w-3xl mx-auto w-full px-6 pb-12 pt-2" : ""
      }
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs text-muted-foreground max-w-md">
          {t("learnings.helper")}
        </p>
        <Button size="sm" onClick={addDraft} className="shrink-0">
          <Plus className="size-3.5" />
          {t("learnings.addLearning")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {drafts.map((localId) => (
          <LearningCard
            key={localId}
            initialText=""
            isDraft
            onSave={(text) => handleSaveDraft(localId, text)}
            onCancel={() => removeDraft(localId)}
          />
        ))}
        {entries.map((entry) => (
          <LearningCard
            key={entry.id}
            initialText={entry.text}
            onSave={(text) => onUpdate(entry.id, text)}
            onDelete={() => setPendingRemove(entry)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("learnings.confirmRemoveTitle")}
        description={t("learnings.confirmRemoveDescription")}
        confirmLabel={t("learnings.confirmRemoveLabel")}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
