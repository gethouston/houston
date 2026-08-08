import { Button, cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJoinAgentTeam } from "../../hooks/queries/use-agent-teams";
import type { TeamView } from "../../lib/teams-model";

/**
 * "Other teams": the teams of this space the caller has NOT joined, filed at the
 * foot of the rail under a disclosure that starts CLOSED.
 *
 * JOINING IS SIDEBAR PINNING, AND IT GRANTS NOTHING. Every team listed here is
 * one the gateway already lets this caller see; joining only moves it up into
 * "Your teams" so its agents and its board are one click away. No agent, file or
 * permission changes hands, which is exactly why the action can sit here in the
 * open with no confirmation: the worst outcome is a team in your sidebar you did
 * not want, and Leave puts it straight back.
 *
 * Closed by default because these are, by definition, the teams the user has not
 * chosen; open, every row states its size and carries its own always-visible
 * Join button (never a hover affordance, never a row-level menu).
 *
 * App-level on purpose: `ui/layout` knows about groups, not about membership in
 * a shared space, so this rides in the sidebar's `footer` slot rather than
 * becoming a new library concept.
 */
export function OtherTeamsBlock({ teams }: { teams: TeamView[] }) {
  const { t } = useTranslation("teams");
  const [open, setOpen] = useState(false);
  if (teams.length === 0) return null;
  return (
    <section aria-label={t("agentTeams.otherTeams")} className="px-2 pb-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {t("agentTeams.otherTeams")}
        </span>
        <span className="shrink-0 text-xs tabular-nums">{teams.length}</span>
      </button>
      {open ? (
        <>
          <p className="px-2 pt-1 pb-1.5 text-xs text-ink-muted text-balance">
            {t("agentTeams.otherTeamsHint")}
          </p>
          {/* Bounded and scrolled inside itself: the footer sits below a
              scrolling rail, so a space with twenty public teams must not push
              the user menu off the bottom of the window. */}
          <ul className="max-h-56 space-y-1 overflow-y-auto overscroll-contain">
            {teams.map((team) => (
              <OtherTeamRow key={team.id} team={team} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

/**
 * One unjoined team: its name, how many people are in it, and Join.
 *
 * The mutation is per ROW, not shared by the list, so the pending state names
 * the team the user actually clicked. It owns its whole error surface
 * (`agent-team-write.ts`), so there is nothing to catch here — a refusal toasts
 * itself and the row simply stays put.
 */
function OtherTeamRow({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const join = useJoinAgentTeam();
  const nameId = useId();
  const buttonId = useId();
  return (
    <li className="ht-hairline flex items-center gap-2 rounded-xl bg-card px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p id={nameId} className="truncate text-sm text-ink" title={team.name}>
          {team.name}
        </p>
        <p className="text-xs text-ink-muted tabular-nums">
          {t("agentTeams.memberCount", {
            count: team.server?.memberCount ?? 0,
          })}
        </p>
      </div>
      {/* `aria-labelledby` reads "Join team, <team name>": every row's button
          carries the same words, and a screen reader listing them must not
          offer five identical "Join team" targets. */}
      <Button
        id={buttonId}
        aria-labelledby={`${buttonId} ${nameId}`}
        size="sm"
        className="shrink-0 rounded-full"
        disabled={join.isPending}
        onClick={() => join.mutate(team.id)}
      >
        {join.isPending ? t("agentTeams.joining") : t("agentTeams.join")}
      </Button>
    </li>
  );
}
