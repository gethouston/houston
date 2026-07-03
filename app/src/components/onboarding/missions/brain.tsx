import { useTranslation } from "react-i18next";
import { COMING_SOON_PROVIDERS, PROVIDERS } from "../../../lib/providers";
import { ProviderGlyph } from "../../shell/provider-logos";
import { OptionCard, OptionGrid, SetupCard } from "../setup-card";

interface BrainMissionProps {
  eyebrow: string;
  provider: string | null;
  onBack: () => void;
  onSelect: (provider: string, model: string) => void;
  onContinue: () => void;
}

/**
 * Step 1 of the AI setup: PICK a provider. No connecting here — that's the
 * next screen. Cards reuse the settings provider logos so the two surfaces
 * look the same.
 */
export function BrainMission({
  eyebrow,
  provider,
  onBack,
  onSelect,
  onContinue,
}: BrainMissionProps) {
  const { t } = useTranslation(["setup", "providers"]);

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("setup:tutorial.missions.brain.title")}
      subtitle={t("setup:tutorial.missions.brain.body")}
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={onContinue}
      nextLabel={t("setup:tutorial.nav.continue")}
      nextDisabled={!provider}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OptionGrid>
          {PROVIDERS.map((prov) => (
            <OptionCard
              key={prov.id}
              leading={<ProviderGlyph providerId={prov.id} />}
              label={prov.name}
              description={prov.subtitle}
              selected={provider === prov.id}
              onSelect={() => onSelect(prov.id, prov.defaultModel)}
            />
          ))}
          {COMING_SOON_PROVIDERS.map((prov) => (
            <OptionCard
              key={prov.id}
              leading={<ProviderGlyph providerId={prov.id} />}
              label={prov.name}
              description={prov.subtitle}
              selected={false}
              disabled
              trailing={
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("providers:card.comingSoon")}
                </span>
              }
            />
          ))}
        </OptionGrid>
      </div>
    </SetupCard>
  );
}
