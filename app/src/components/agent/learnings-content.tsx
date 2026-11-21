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
import type { LearningProvenanceView } from "../../lib/learning-provenance";
import { LearningCard } from "./learning-card";

export interface LearningEntry {
  index: number;
  text: string;
  id: string;
  provenance?: LearningProvenanceView | null;
}

export function LearningsContent({
  entries,
  onAdd,
  onRemove,
  onUpdate,
  layout = "full",
  showHelper = true,
}: {
  entries: LearningEntry[];
  onAdd: (text: string) => Promise<boolean>;
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => Promise<boolean>;
  layout?: "full" | "section";
  showHelper?: boolean;
}) {
  const { t } = useTranslation("agents");
  const [drafts, setDrafts] = useState<{ id: string; text: string }[]>([]);
  const [pendingRemove, setPendingRemove] = useState<LearningEntry | null>(
    null,
  );
  const draftCounterRef = useRef(0);

  const addDraft = (text = "") => {
    draftCounterRef.current += 1;
    const id = `draft-${draftCounterRef.current}`;
    setDrafts((prev) => [{ id, text }, ...prev]);
  };

  const removeDraft = (localId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== localId));
  };

  const handleSaveDraft = (localId: string, text: string) => {
    removeDraft(localId);
    void onAdd(text).then((landed) => {
      if (!landed) addDraft(text);
    });
  };

  const handleConfirmRemove = () => {
    if (!pendingRemove) return;
    const { id } = pendingRemove;
    setPendingRemove(null);
    onRemove(id);
  };

  if (entries.length === 0 && drafts.length === 0) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
        <EmptyHeader>
          <EmptyTitle>{t("learnings.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("learnings.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => addDraft()}>
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
      <div className="flex items-center justify-end gap-4 mb-4">
        {showHelper && (
          <p className="mr-auto text-xs text-ink-muted max-w-md">
            {t("learnings.helper")}
          </p>
        )}
        <Button size="sm" onClick={() => addDraft()} className="shrink-0">
          <Plus className="size-3.5" />
          {t("learnings.addLearning")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <LearningCard
            key={draft.id}
            initialText={draft.text}
            isDraft
            onSave={(text) => {
              handleSaveDraft(draft.id, text);
              return undefined;
            }}
            onCancel={() => removeDraft(draft.id)}
          />
        ))}
        {entries.map((entry) => (
          <LearningCard
            key={entry.id}
            initialText={entry.text}
            provenance={entry.provenance}
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
