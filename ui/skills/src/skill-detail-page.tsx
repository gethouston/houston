import { Button, ConfirmDialog, cn } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SkillDetailHeaderActions } from "./skill-detail-header-actions";
import type { Skill } from "./types";

export interface SkillDetailPageLabels {
  notFound?: string;
  backAria?: string;
  saveChanges?: string;
  savingChanges?: string;
  moreOptions?: string;
  delete?: string;
  deleteTitle?: (name: string) => string;
  deleteDescription?: string;
  deleteConfirmLabel?: string;
  instructionsPlaceholder?: string;
  /** Note shown in the header when `readOnly` — e.g. "Managed by your org". */
  managedNote?: string;
}

const DEFAULT_LABELS: Required<SkillDetailPageLabels> = {
  notFound: "Skill not found",
  backAria: "Back to skills",
  saveChanges: "Save changes",
  savingChanges: "Saving...",
  moreOptions: "More options",
  delete: "Delete skill",
  deleteTitle: (name) => `Delete "${name}"?`,
  deleteDescription:
    "This removes the skill from your agent. You can reinstall it later.",
  deleteConfirmLabel: "Delete",
  instructionsPlaceholder: "Instructions for this skill...",
  managedNote: "Managed by your organization",
};

export interface SkillDetailPageProps {
  skill: Skill | undefined;
  onBack: () => void;
  onSave: (skillName: string, instructions: string) => Promise<void>;
  onDelete: (skillName: string) => Promise<void>;
  /**
   * Read-only mode: the skill is visible but not editable (a non-manager on a
   * managed agent). Hides the Save + Delete affordances and locks the textarea;
   * shows `labels.managedNote` in the header instead. The gateway enforces this
   * for real.
   */
  readOnly?: boolean;
  labels?: SkillDetailPageLabels;
}

export function SkillDetailPage({
  skill,
  onBack,
  onSave,
  onDelete,
  readOnly = false,
  labels,
}: SkillDetailPageProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (skill) setInstructions(skill.instructions);
  }, [skill]);

  const handleSave = useCallback(async () => {
    if (!skill) return;
    setSaving(true);
    try {
      await onSave(skill.name, instructions);
    } finally {
      setSaving(false);
    }
  }, [skill, instructions, onSave]);

  const handleConfirmDelete = useCallback(async () => {
    if (!skill) return;
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await onDelete(skill.name);
      onBack();
    } finally {
      setDeleting(false);
    }
  }, [skill, onDelete, onBack]);

  if (!skill) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{l.notFound}</p>
      </div>
    );
  }

  const isDirty = instructions !== skill.instructions;
  // Fall back to the id (the directory slug — the canonical skill identity)
  // when a detail response carries no name, so the header stays meaningful.
  const displayName = humanizeSkillName(skill.name || skill.id);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Single action bar: back, context, primary action. */}
      <header className="px-4 py-2.5 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label={l.backAria}
          >
            <ArrowLeft className="size-4" />
          </Button>

          <p className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
            {displayName}
          </p>

          <SkillDetailHeaderActions
            readOnly={readOnly}
            isDirty={isDirty}
            saving={saving}
            deleting={deleting}
            onSave={handleSave}
            onRequestDelete={() => setConfirmOpen(true)}
            labels={l}
          />
        </div>
      </header>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={l.deleteTitle(displayName)}
        description={l.deleteDescription}
        confirmLabel={l.deleteConfirmLabel}
        onConfirm={handleConfirmDelete}
      />

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 pt-3 pb-12">
          <section className="rounded-xl bg-secondary p-3">
            {skill.description && (
              <p className="text-xs text-muted-foreground px-2 pb-2">
                {skill.description}
              </p>
            )}
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              readOnly={readOnly}
              rows={18}
              placeholder={l.instructionsPlaceholder}
              className={cn(
                "w-full px-4 py-3 text-sm text-foreground leading-relaxed font-mono",
                "placeholder:text-muted-foreground/60",
                "bg-background border border-border/20 rounded-lg",
                "outline-none resize-y transition-shadow duration-200",
                "focus:shadow-sm",
                readOnly && "cursor-default text-muted-foreground resize-none",
              )}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function humanizeSkillName(slug: string): string {
  // Tolerate a missing/empty identity: a display helper must never crash the
  // whole view. Degrade gracefully rather than throw on `undefined`.
  if (!slug) return "";
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
