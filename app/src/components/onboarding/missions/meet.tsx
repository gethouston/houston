import {
  AGENT_COLORS,
  cn,
  colorValue,
  HoustonAvatar,
  Input,
  resolveAgentColor,
} from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SetupCard } from "../setup-card";

interface MeetMissionProps {
  eyebrow: string;
  name: string;
  color: string;
  namePlaceholder: string;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  /** Optional back link (omitted when there's nothing useful to go back to). */
  onBack?: () => void;
  /** Provisioning in flight — disables + spins the create button. */
  creating?: boolean;
  onBegin: () => void;
}

/** Create-your-first-agent step: name + a color for its avatar. */
export function MeetMission({
  eyebrow,
  name,
  color,
  namePlaceholder,
  onNameChange,
  onColorChange,
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
        <div className="flex items-center gap-2">
          {AGENT_COLORS.map((item) => {
            const selected =
              color === item.id || color === item.light || color === item.dark;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                aria-label={item.id}
                onClick={() => onColorChange(item.id)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full transition-transform",
                  selected
                    ? "ring-2 ring-foreground/30 ring-offset-2"
                    : "hover:scale-110",
                )}
                style={{ backgroundColor: colorValue(item) }}
              >
                {selected && <Check className="size-3.5 text-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </SetupCard>
  );
}
