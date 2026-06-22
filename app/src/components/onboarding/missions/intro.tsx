import { useTranslation } from "react-i18next";
import { Bot, LayoutGrid, Mail, Sparkles } from "lucide-react";

import { HoustonLogo } from "../../shell/experience-card";
import { SetupCard } from "../setup-card";

interface IntroMissionProps {
  /** Advance into the first setup step (log in to the AI subscription). */
  onContinue: () => void;
}

/**
 * Unnumbered framing screen that opens the setup phase. A centered hero — the
 * Houston mark, the ask, and a preview of the four quick steps — so the user
 * knows exactly what's coming before the AI + apps steps. Monochrome per the
 * design system; the structure does the work, not color.
 */
export function IntroMission({ onContinue }: IntroMissionProps) {
  const { t } = useTranslation("setup");
  const steps = [
    { label: t("tutorial.missions.intro.steps.ai"), Icon: Sparkles },
    { label: t("tutorial.missions.intro.steps.apps"), Icon: LayoutGrid },
    { label: t("tutorial.missions.intro.steps.agent"), Icon: Bot },
    { label: t("tutorial.missions.intro.steps.email"), Icon: Mail },
  ];

  return (
    <SetupCard onNext={onContinue} nextLabel={t("tutorial.missions.intro.cta")}>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <HoustonLogo size={52} />
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("tutorial.missions.intro.title")}
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("tutorial.missions.intro.body")}
            </p>
          </div>
        </div>

        <ol className="flex w-full max-w-sm flex-col gap-2">
          {steps.map(({ label, Icon }, i) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-left"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">
                {label}
              </span>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {i + 1}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </SetupCard>
  );
}
