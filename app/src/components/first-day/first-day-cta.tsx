import {
  AsyncButton,
  cn,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { startFirstDay } from "./start-first-day";

/**
 * The one "Start {{name}}'s first day" button. It holds its own busy state and
 * drops repeat presses; the setup task's chat opens beside the board once the
 * task exists, and the recorded start takes every start button away.
 */
export function FirstDayStartButton({
  agent,
  className,
}: {
  agent: Agent;
  className?: string;
}) {
  const { t } = useTranslation("board");
  return (
    <AsyncButton
      data-first-day-start={agent.folderPath}
      className={cn("active:scale-[0.96]", className)}
      onClick={() => startFirstDay(agent)}
    >
      {t("firstDay.start", { name: agent.name })}
    </AsyncButton>
  );
}

/** The board of an employee whose first day waits and who has no tasks yet. */
export function FirstDayHero({ agent }: { agent: Agent }) {
  const { t } = useTranslation("board");
  return (
    <Empty className="border-0" data-testid="first-day-hero">
      <EmptyHeader>
        <EmptyMedia>
          <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={56} />
        </EmptyMedia>
        <EmptyTitle className="text-2xl font-normal tracking-normal">
          {t("firstDay.heroTitle", { name: agent.name })}
        </EmptyTitle>
        <EmptyDescription className="text-base">
          {t("firstDay.explain", { name: agent.name })}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <FirstDayStartButton
          agent={agent}
          className="h-11 w-full px-6 md:w-auto"
        />
      </EmptyContent>
    </Empty>
  );
}

/**
 * The same offer above a board that already holds tasks: the tasks stay the
 * page, the first day waits one row above them.
 */
export function FirstDayCompact({ agent }: { agent: Agent }) {
  const { t } = useTranslation("board");
  return (
    <section
      data-testid="first-day-compact"
      className="mx-3 mt-3 flex shrink-0 flex-col gap-3 rounded-xl bg-card px-4 py-3 ht-hairline md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={28} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {t("firstDay.compactTitle", { name: agent.name })}
          </p>
          <p className="text-sm text-ink-muted">
            {t("firstDay.explain", { name: agent.name })}
          </p>
        </div>
      </div>
      <FirstDayStartButton agent={agent} className="w-full md:w-auto" />
    </section>
  );
}
