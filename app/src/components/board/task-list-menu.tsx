import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * A phone task list's overflow control: the round "…" chip in the drilled
 * header and the menu it opens. The ITEMS are the caller's — an agent's list
 * offers Search and Archived, a team's adds its settings — but the chip, its
 * name and its geometry are shared, so the two screens wear one control.
 *
 * Search hides behind it because an always-on field would take the screen's
 * first line from the tasks, and most visits scroll rather than search. The
 * archive hides behind it because it is the one band that is not part of the
 * list's job — reaching it is a deliberate act, not a scroll away.
 */
export function TaskListMenu({
  testId,
  children,
}: {
  /** Stamped on the trigger, so a spec can address the list it means. */
  testId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("shell");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("taskList.menu.label")}
        data-testid={testId}
        className="ht-hairline flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Ellipsis aria-hidden className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
