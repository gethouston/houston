/**
 * RoutineDetailsButton — the routine chat header's "what is this?" affordance
 * (PRODUCT-1208): an info button opening a popover with the routine's
 * instruction (the description users asked for — the prompt IS what the
 * routine does) and its recorded run history. The content mounts only while
 * the popover is open, so the per-routine runs query fires on demand and stays
 * live through the usual `RoutineRunsChanged` invalidation.
 */

import { Popover, PopoverContent, PopoverTrigger } from "@houston-ai/core";
import type { Routine } from "@houston-ai/engine-client";
import { RoutineDetails, type RunStatus } from "@houston-ai/routines";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRoutineRuns } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import type { Agent } from "../../lib/types";

interface Props {
  agent: Agent;
  routine: Routine;
}

/** The popover body — a separate component so its hooks run only while open. */
function DetailsContent({ agent, routine }: Props) {
  const { t } = useTranslation("routines");
  const { locale } = useRoutineLabels();
  // The agent-wide runs query (the same one the tab's list already holds) —
  // the host's GET has no per-routine filter, so narrowing happens here. The
  // store keeps runs newest-first and caps them at 50 per routine.
  const { data: allRuns, isLoading } = useRoutineRuns(agent.folderPath);
  const runs = allRuns?.filter((run) => run.routine_id === routine.id);
  return (
    <RoutineDetails
      prompt={routine.prompt}
      runs={runs}
      runsLoading={isLoading}
      locale={locale}
      labels={{
        promptTitle: t("details.promptTitle"),
        runsTitle: t("details.runsTitle"),
        runsLoading: t("details.runsLoading"),
      }}
      runListLabels={{
        empty: t("details.runsEmpty"),
        status: t("details.status", { returnObjects: true }) as Record<
          RunStatus,
          string
        >,
      }}
    />
  );
}

export function RoutineDetailsButton({ agent, routine }: Props) {
  const { t } = useTranslation("routines");
  return (
    // Stop pointer events from bubbling — the board detail panel would read
    // trigger clicks as "click outside → close panel" (same guard as the
    // composer's model selector).
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("details.open")}
            className="size-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-hover/50 transition-colors shrink-0"
          >
            <Info className="size-4" strokeWidth={1.75} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex max-h-[min(70vh,32rem)] w-96 flex-col overflow-y-auto"
        >
          <DetailsContent agent={agent} routine={routine} />
        </PopoverContent>
      </Popover>
    </fieldset>
  );
}
