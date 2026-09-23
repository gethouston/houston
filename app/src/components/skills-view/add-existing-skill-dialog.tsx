import {
  AsyncButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { SkillIcon } from "../skill-icon";
import type { ManagedSkillRow } from "./skill-editor-props";
import { SkillsRetryEmpty } from "./skills-list-states";

/** How many rows the wait lays out — enough to read as a list. */
const SKELETON_ROWS = ["a", "b", "c"] as const;

/** One row's leading art, shared by the wait and the real rows so nothing
 *  shifts when the list lands. */
const ICON_CLASS =
  "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input";

function AddableSkillRow({
  row,
  onAdd,
}: {
  row: ManagedSkillRow;
  onAdd: (row: ManagedSkillRow) => Promise<void>;
}) {
  const { t } = useTranslation("skills");
  const title = skillDisplayTitle(row.summary);

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <SkillIcon image={row.summary.image} bubbleClassName={ICON_CLASS} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink text-sm">{title}</p>
        {row.summary.description && (
          <p className="truncate text-[13px] text-ink-muted">
            {row.summary.description}
          </p>
        )}
      </div>
      <AsyncButton
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full"
        // Every row's button reads "Add", so the name carries the skill it
        // adds — a list of identical buttons is unusable by ear.
        aria-label={t("global.addExisting.addNamed", { name: title })}
        onClick={() => onAdd(row)}
      >
        {t("global.addExisting.add")}
      </AsyncButton>
    </li>
  );
}

/**
 * "Add an existing skill": the workspace skills this AI Employee does not have
 * yet, each with the one act that gives it one.
 *
 * A workspace skill lives once in the store and an employee LOADS it, so the
 * add is a reversible manifest write and the row leaves the list the moment it
 * lands — the dialog stays open so several can be added in one sitting.
 */
export function AddExistingSkillDialog({
  open,
  onOpenChange,
  skills,
  loading,
  failed,
  onRetry,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Store skills this employee does not load yet. */
  skills: ManagedSkillRow[];
  loading: boolean;
  /** The read did not answer. Already toasted and reported at the call. */
  failed: boolean;
  onRetry: () => void;
  onAdd: (row: ManagedSkillRow) => Promise<void>;
}) {
  const { t } = useTranslation("skills");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t("global.addExisting.title")}</DialogTitle>
          <DialogDescription>
            {t("global.addExisting.description")}
          </DialogDescription>
        </DialogHeader>
        {loading && skills.length === 0 ? (
          <div
            role="status"
            aria-label={t("grid.loading")}
            className="flex flex-col gap-1"
          >
            {SKELETON_ROWS.map((id) => (
              <div key={id} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
                <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        ) : failed && skills.length === 0 ? (
          <SkillsRetryEmpty
            title={t("global.loadFailedTitle")}
            description={t("global.loadFailedDescription")}
            onRetry={onRetry}
          />
        ) : skills.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("global.addExisting.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("global.addExisting.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
            {skills.map((row) => (
              <AddableSkillRow key={row.slug} row={row} onAdd={onAdd} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
