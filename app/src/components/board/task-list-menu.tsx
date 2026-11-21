import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function TaskListMenu({
  testId,
  children,
}: {
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
