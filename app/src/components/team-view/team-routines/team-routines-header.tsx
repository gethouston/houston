import { Badge } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * The employee Routines section's count and create action. The header tools
 * provider chooses the strip or row layout at the available width.
 *
 * - **`strip`**: the third zone of the one-row team strip. The count and the
 *   create button, and NO "Routines" title: the lit tab three inches to the
 *   left already said that word, and saying it twice on one line is the
 *   crowding this layout exists to undo.
 * - **`row`**: the two-row fallback — a slim band with the title, the count,
 *   and the button at its right edge.
 *
 * The create button steps aside in either form when the grid is showing its
 * EMPTY state, which carries the same button: two identical filled pills on
 * one screen is not a choice the user has, it is the same act twice. The
 * caller decides, by passing no button — the grid stops being empty the moment
 * a DRAFT row lands, and the header takes the button back then.
 */
export function TeamRoutinesHeader({
  variant,
  count,
  createButton,
}: {
  /** Which form to draw. The chrome decides; see the module comment. */
  variant: "strip" | "row";
  /** Created routines in the list. Zero hides the badge (a draft is not one). */
  count: number;
  /** The create action, or nothing while the grid's empty state carries it. */
  createButton?: ReactNode;
}) {
  const { t } = useTranslation("routines");

  const countBadge = count > 0 && (
    <Badge variant="secondary" className="tabular-nums">
      {count}
    </Badge>
  );

  if (variant === "strip") {
    return (
      <>
        {countBadge}
        {createButton}
      </>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-1 pb-3">
      <h2 className="text-sm font-medium text-ink">{t("listTitle")}</h2>
      {countBadge}
      <div className="ml-auto flex items-center gap-2">{createButton}</div>
    </div>
  );
}
