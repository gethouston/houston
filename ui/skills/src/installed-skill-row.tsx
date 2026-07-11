import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { skillMonogram } from "./installed-skill-editor-model";

export interface InstalledSkillRowLabels {
  editAria?: (name: string) => string;
  deleteAria?: (name: string) => string;
}

const DEFAULT_LABELS: Required<InstalledSkillRowLabels> = {
  editAria: (name) => `Edit ${name}`,
  deleteAria: (name) => `Delete ${name}`,
};

export interface InstalledSkillRowProps {
  skill: {
    name: string;
    title: string | null;
    description: string;
    image: string | null;
  };
  /** Localized display title (`title ?? humanize(name)`); the app owns i18n. */
  displayName: string;
  /** Resolved image URL or null → the row falls back to a monogram box. */
  imageUrl: string | null;
  /** Pen icon or row-body click → open the edit modal. */
  onEdit: () => void;
  /** Trash icon → parent opens the confirm dialog. */
  onDelete: () => void;
  labels?: InstalledSkillRowLabels;
}

/**
 * An installed-skill row in the Integrations "AppRow" idiom: a small leading
 * image box (monogram fallback), the display title + one-line description, and
 * two always-visible icon-only trailing actions — a **pen** (left) that opens
 * the edit modal and a **trash** (right, destructive on hover) that opens the
 * delete confirm. Clicking the row body also opens the edit modal, mirroring the
 * marketplace rows; both icon buttons `stopPropagation` so they never double-fire.
 */
export function InstalledSkillRow({
  skill,
  displayName,
  imageUrl,
  onEdit,
  onDelete,
  labels,
}: InstalledSkillRowProps) {
  const l = { ...DEFAULT_LABELS, ...labels };

  return (
    // biome-ignore lint/a11y/useSemanticElements: the row holds real <button> actions; a native <button> here would nest buttons (invalid HTML), so role="button" on a div is the correct pattern.
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none"
    >
      <SkillImageBox imageUrl={imageUrl} displayName={displayName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {displayName}
        </p>
        {skill.description && (
          <p className="truncate text-[11px] text-muted-foreground">
            {skill.description}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={l.editAria(displayName)}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label={l.deleteAria(displayName)}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SkillImageBox({
  imageUrl,
  displayName,
}: {
  imageUrl: string | null;
  displayName: string;
}) {
  const [broken, setBroken] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the broken flag whenever the image source changes.
  useEffect(() => setBroken(false), [imageUrl]);

  const showImage = imageUrl && !broken;

  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-contain p-1"
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {skillMonogram(displayName)}
        </span>
      )}
    </span>
  );
}
