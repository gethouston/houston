import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useTimezonePreference } from "../../../hooks/use-timezone-preference";
import type { Agent } from "../../../lib/types";
import { useRoutineLeadingIcon } from "../../agent/routine-leading-icon";
import { AgentReadsFailed } from "../../agent-reads-failed";
import { PageHeaderTools } from "../../shell/page-header/page-header-tools";
import { TeamRoutinesCreateButton } from "./team-routines-create-button";
import { TeamRoutinesFooter } from "./team-routines-footer";
import { TeamRoutinesGrid } from "./team-routines-grid";
import { TeamRoutinesHeader } from "./team-routines-header";
import { useTeamRoutineActions } from "./use-team-routine-actions";
import { useTeamRoutineHost } from "./use-team-routine-host";
import { useTeamRoutinesData } from "./use-team-routines-data";

export function TeamRoutines({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["teams", "routines"]);
  const tz = useTimezonePreference();
  const data = useTeamRoutinesData(agent);
  const actions = useTeamRoutineActions(agent);
  const host = useTeamRoutineHost({
    agent,
    list: data.list,
    accountTimezone: tz.timezone ?? "UTC",
    triggerSummaries: data.triggers.triggerSummaries,
  });
  const leadingIcon = useRoutineLeadingIcon(data.triggers.triggersEnabled);

  if (!tz.loaded || !tz.timezone) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-ink-muted">
          {t("routines:loading")}
        </p>
      </div>
    );
  }

  const count = data.list.routines.length;
  const listEmpty = count === 0 && data.drafts.length === 0;

  const createButton = (
    <TeamRoutinesCreateButton onClick={host.startNewRoutine} />
  );

  return (
    <div className="flex h-full min-h-0">
      {!host.screenOpen && (
        <div
          className={cn(
            "flex min-w-0 flex-col",
            host.chatOpen ? "flex-1" : "mx-auto w-full max-w-3xl",
          )}
        >
          <PageHeaderTools>
            {(oneRow) => (
              <TeamRoutinesHeader
                variant={oneRow ? "strip" : "row"}
                count={count}
                createButton={listEmpty ? undefined : createButton}
              />
            )}
          </PageHeaderTools>

          <div className="px-3">
            <AgentReadsFailed
              failures={data.failures}
              onRetry={data.retry}
              retrying={data.retrying}
            />
          </div>

          <TeamRoutinesGrid
            agent={agent}
            data={data}
            actions={actions}
            host={host}
            accountTimezone={tz.timezone}
            leadingIcon={leadingIcon}
            createButton={createButton}
          />

          {!listEmpty && <TeamRoutinesFooter tz={tz} />}
        </div>
      )}

      {host.node}
    </div>
  );
}
