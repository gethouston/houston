import { Badge } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * The Routines section's own tools: how many routines this team has, and the
 * one thing you came here to do. Two forms, and the CALLER never picks — the
 * team chrome measures its strip and says which is honest for the width
 * (`team-chrome-tools.tsx`).
 *
 * - **`strip`**: the third zone of the one-row team strip. The count and the
 *   create button, and NO "Routines" title: the lit tab three inches to the
 *   left already said that word, and saying it twice on one line is the
 *   crowding this layout exists to undo.
 * - **`row`**: the two-row fallback — a slim band with the title, the count,
 *   and the button at its right edge.
 *
 * Its agent dropdown is back, but it is a different control: a SECTION-LOCAL
 * filter (`TeamAgentFilterCapsule`), not the team-wide pin. Narrowing this
 * list no longer narrows the board the user returns to, which is why a tab
 * click always opens Routines team-wide.
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
  agentFilter,
  createButton,
}: {
  /** Which form to draw. The chrome decides; see the module comment. */
  variant: "strip" | "row";
  /** Created routines in the list. Zero hides the badge (a draft is not one). */
  count: number;
  /** This section's OWN "All agents" capsule — never the team-wide pin. */
  agentFilter: ReactNode;
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
        {agentFilter}
        {createButton}
      </>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-1 pb-3">
      <h2 className="text-sm font-medium text-ink">{t("listTitle")}</h2>
      {countBadge}
      <div className="ml-auto flex items-center gap-2">
        {agentFilter}
        {createButton}
      </div>
    </div>
  );
}
