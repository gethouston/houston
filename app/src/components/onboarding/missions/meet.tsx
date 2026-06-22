import { useTranslation } from "react-i18next";
import { HoustonAvatar, Input, resolveAgentColor } from "@houston-ai/core";
import { SetupCard } from "../setup-card";

interface MeetMissionProps {
  eyebrow: string;
  name: string;
  /** The agent's avatar color (a sensible default; not chosen here anymore). */
  color: string;
  namePlaceholder: string;
  onNameChange: (name: string) => void;
  /** Optional back link (omitted when there's nothing useful to go back to). */
  onBack?: () => void;
  /** Provisioning in flight — disables + spins the create button. */
  creating?: boolean;
  onBegin: () => void;
}

/** Create-your-first-agent step. Just the name — color uses a default. */
export function MeetMission({
  eyebrow,
  name,
  color,
  namePlaceholder,
  onNameChange,
  onBack,
  creating,
  onBegin,
}: MeetMissionProps) {
  const { t } = useTranslation("setup");
  const trimmed = name.trim();
  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.meet.title")}
      subtitle={t("tutorial.missions.meet.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
      onNext={() => trimmed && onBegin()}
      nextLabel={
        creating
          ? t("tutorial.missions.meet.creating")
          : t("tutorial.missions.meet.begin")
      }
      nextDisabled={!trimmed || creating}
      nextLoading={creating}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <HoustonAvatar color={resolveAgentColor(color)} diameter={88} />
        <Input
          autoFocus
          value={name}
          placeholder={namePlaceholder}
          className="max-w-sm rounded-full text-center"
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
    </SetupCard>
  );
}
