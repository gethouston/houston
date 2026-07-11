import { type ReactNode, useState } from "react";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { analytics } from "../../lib/analytics";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/i18n";
import { OptionCard, SetupCard } from "../onboarding/setup-card";
import { SpaceScreen } from "../space/space-screen";

/**
 * First-run language flow, styled like the rest of setup. A single beat: the
 * language picker (pick, then Continue, so a misclick is recoverable) floated on
 * the shared `SpaceScreen` starfield, so it reads as the same continuous space
 * as sign-in and onboarding.
 *
 * This is the TRUE first screen of the app. Shown before the disclaimer so a
 * Spanish/Portuguese speaker reads the agreement in their own language. Skipped
 * once the `locale` engine preference is set; Settings has the same picker for
 * later changes.
 */
export function LanguageGate({ children }: { children: ReactNode }) {
  const { locale, isLoading, setLocale } = useLocalePreference();

  if (isLoading) {
    return (
      <SpaceScreen>
        {/* Transparent hold — the SpaceScreen already paints the backdrop, so
            we don't double-paint a dim overlay on the starfield. Full-size so
            the layout doesn't jump when the picker resolves. */}
        <div aria-hidden className="flex flex-1" />
      </SpaceScreen>
    );
  }

  if (locale) return <>{children}</>;

  return (
    <SpaceScreen>
      <LanguagePicker onPick={setLocale} />
    </SpaceScreen>
  );
}

// In the target language itself — the user has no locale yet, so "Español"
// reads better to a Spanish speaker than "Spanish".
const DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

function LanguagePicker({
  onPick,
}: {
  onPick: (locale: SupportedLocale) => Promise<void>;
}) {
  const [selected, setSelected] = useState<SupportedLocale | null>(null);
  const [pending, setPending] = useState(false);

  const handleContinue = async () => {
    if (!selected || pending) return;
    setPending(true);
    try {
      await onPick(selected);
      // Funnel step 5: language chosen (fires only after the write succeeds,
      // so a failed-then-retried pick isn't double counted).
      analytics.track("onboarding_language_selected", { locale: selected });
    } catch {
      // Write failed — stay on the picker so the user can retry. No localized
      // error is possible yet (no locale).
      setPending(false);
    }
  };

  return (
    <SetupCard
      onSpace
      title="Choose your language"
      subtitle="English · Español · Português"
      onNext={() => void handleContinue()}
      nextLabel="Continue"
      nextDisabled={!selected}
      nextLoading={pending}
    >
      <div className="flex flex-col gap-2">
        {SUPPORTED_LOCALES.map((loc) => (
          <OptionCard
            key={loc}
            label={DISPLAY_NAMES[loc]}
            selected={selected === loc}
            onSelect={() => setSelected(loc)}
          />
        ))}
      </div>
    </SetupCard>
  );
}
