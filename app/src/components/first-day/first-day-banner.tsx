import {
  AsyncButton,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { FirstDayCompact } from "./first-day-cta";
import type { FirstDayPlacement } from "./first-day-model";
import { startFirstDay } from "./start-first-day";

/**
 * The team board's calm note while employees wait for their first day. Each
 * employee is a chip that starts that first day in one tap: the note already
 * says what the tap does, and the setup chat opens right here beside the
 * board, so a detour through the employee's own board would only add a step.
 */
export function FirstDayBanner({ agents }: { agents: Agent[] }) {
  const { t } = useTranslation("board");
  return (
    <section
      data-testid="first-day-banner"
      className="mx-3 mt-3 flex shrink-0 flex-col gap-3 rounded-xl bg-card px-4 py-3 ht-hairline"
    >
      <div>
        <p className="text-sm font-medium text-ink text-balance">
          {t("firstDay.bannerTitle")}
        </p>
        <p className="text-sm text-ink-muted">{t("firstDay.bannerExplain")}</p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {agents.map((agent) => (
          <li key={agent.folderPath} className="min-w-0">
            <AsyncButton
              variant="secondary"
              data-first-day-start={agent.folderPath}
              aria-label={t("firstDay.start", { name: agent.name })}
              className="h-11 max-w-full pl-1.5 active:scale-[0.96] md:h-9"
              onClick={() => startFirstDay(agent)}
            >
              <HoustonAvatar
                color={resolveAgentColor(agent.color)}
                diameter={24}
              />
              <span className="truncate">{agent.name}</span>
            </AsyncButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What a board shows ABOVE its tasks for the first day: the compact offer on
 * one employee's board, the banner on the team's. The hero is not here: it
 * replaces the empty board rather than leading it.
 */
export function FirstDayLead({
  placement,
}: {
  placement: FirstDayPlacement<Agent>;
}) {
  if (placement.kind === "compact")
    return <FirstDayCompact agent={placement.agent} />;
  if (placement.kind === "banner")
    return <FirstDayBanner agents={placement.agents} />;
  return null;
}
