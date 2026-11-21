import { useTranslation } from "react-i18next";
import { BASIC_TEAM_ROLES } from "./basic-team-model";
import { TeamAvatarStack } from "./team-avatar-stack";
import { TeamChoiceCard } from "./team-choice-card";

const HIRED_FACES = 3;

export function TeamChoiceView({
  basicColors,
  hiredColors,
  onBasic,
  onHire,
}: {
  basicColors: readonly string[];
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
