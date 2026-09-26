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

/** One employee's routines, with the selected routine's chat in the shell panel. */
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
  // The leading glyph depends on whether this host supports triggers.
  const leadingIcon = useRoutineLeadingIcon(data.triggers.triggersEnabled);

  // Hooks may not run conditionally, so both honest non-list states come after
  // every hook above.

  // Schedule rows render against the real account zone, so the list waits for
  // the timezone roundtrip once per open.
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
  // Genuinely nothing to show: the grid renders ONLY its empty state, which
  // carries the create button, so the header lets go of it. One draft row is
  // enough to end that — the grid has rows again, and the header takes the
  // button back.
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

          {/* The strip pays the list's own gutter, so its left edge lands on the
            rows' rather than four pixels inside them. */}
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

          {/* The zone every schedule above is read in, and the one place to
            change it. Drops with the list: an empty state has no schedules. */}
          {!listEmpty && <TeamRoutinesFooter tz={tz} />}
        </div>
      )}

      {/* The selected routine's chat, portaled into the shared shell panel. It
          adds no layout here. */}
      {host.node}
    </div>
  );
}
