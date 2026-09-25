import { useTranslation } from "react-i18next";
import { BASIC_TEAM_ROLES } from "./basic-team-model";
import { TeamAvatarStack } from "./team-avatar-stack";
import { TeamChoiceCard } from "./team-choice-card";

/** How many hires the "Hire your team" picture shows before its open seat. */
const HIRED_FACES = 3;

/**
 * The card's first screen: two ways to a first team, the ready-made one
 * first. "Start with a basic team" shows the three it brings, in the colors
 * they will wear; "Hire your team" shows an open seat, after the faces of
 * anyone already hired one by one. Pressing either IS the answer.
 *
 * The person comes back here from either path, so once someone is hired the
 * screen says how many are on the team, and the footer offers Done.
 */
export function TeamChoiceView({
  basicColors,
  hiredColors,
  onBasic,
  onHire,
}: {
  basicColors: readonly string[];
  /** Everyone on the team so far, oldest first: employees a resumed first
   *  run hired before, then this roster, joining or hired. */
  hiredColors: readonly (string | undefined)[];
  onBasic: () => void;
  onHire: () => void;
}) {
  const { t, i18n } = useTranslation(["setup", "agentOnboarding"]);
  const roles = new Intl.ListFormat(i18n.language, {
    type: "conjunction",
  }).format(
    BASIC_TEAM_ROLES.map((id) => t(`agentOnboarding:roleSetup.roles.${id}`)),
  );
  const count = hiredColors.length;

  return (
    <div className="flex flex-col gap-4">
      {count > 0 && (
        <p className="text-center text-sm font-medium text-ink" role="status">
          {t("setup:team.choice.soFar", { count })}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <TeamChoiceCard
          visual={<TeamAvatarStack colors={basicColors} />}
          label={t("setup:team.choice.basicTitle")}
          description={t("setup:team.choice.basicBody", { roles })}
          onSelect={onBasic}
        />
        <TeamChoiceCard
          visual={
            <TeamAvatarStack
              colors={hiredColors.slice(-HIRED_FACES)}
              withOpenSeat
            />
          }
          label={t("setup:team.choice.hireTitle")}
          description={t("setup:team.choice.hireBody")}
          onSelect={onHire}
        />
      </div>
    </div>
  );
}
