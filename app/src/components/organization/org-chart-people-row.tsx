import type { OrgMember } from "@houston/engine-adapter";
import { Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { PersonFace } from "../mission-person-face";
import { UsageCount } from "./org-chart-usage";
import type {
  OrgChartMembersState,
  OrgChartUsageState,
} from "./org-chart-view-model";
import { personDisplayName } from "./people-tab-model";

/** Two placeholder faces at the real chip height, so the people arriving move
 *  nothing that is already on screen. */
function PeopleSkeleton() {
  return (
    <div className="flex gap-4" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * The humans of one team card: a wrapped strip of faces rather than a list,
 * because people are the team's width and the agents underneath are its depth.
 *
 * A failed membership read says so in a quiet line instead of rendering an
 * empty strip, which would claim a team nobody is in. The caller's own face
 * carries the same "(you)" marker every other people list in Houston uses.
 */
export function OrgChartPeopleStrip({
  people,
  selfId,
  messagesOf,
  state,
  members,
}: {
  people: readonly OrgMember[];
  selfId: string | null;
  /** This person's 30-day message total across the chart's visible agents. */
  messagesOf: (userId: string) => number;
  state: OrgChartUsageState;
  /** Whether the card's membership read has landed. */
  members: OrgChartMembersState;
}) {
  const { t } = useTranslation("teams");
  if (members === "loading") return <PeopleSkeleton />;
  if (members === "error")
    return (
      <p className="text-sm text-ink-muted">
        {t("orgChart.membersUnavailable")}
      </p>
    );

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {people.map((person) => {
        const name = personDisplayName(person, t("orgChart.unknownPerson"));
        return (
          <li key={person.userId} className="flex min-w-0 items-center gap-2">
            <PersonFace
              person={{
                id: person.userId,
                label: name,
                imageUrl: person.photoUrl,
              }}
              className="size-6"
              initialsClassName="text-xs"
            />
            <span className="truncate text-sm text-ink">{name}</span>
            {person.userId === selfId && (
              <span className="shrink-0 text-xs text-ink-muted">
                {t("people.roster.you")}
              </span>
            )}
            <UsageCount state={state} messages={messagesOf(person.userId)} />
          </li>
        );
      })}
    </ul>
  );
}
