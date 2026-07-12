import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { analytics } from "../../lib/analytics";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/i18n";
import { OptionCard, SetupCard } from "../onboarding/setup-card";
import { SpaceScreen } from "../space/space-screen";

/**
 * First-run language flow, styled like the rest of setup. A single beat: the
 * language picker, floated on the shared `SpaceScreen` starfield so it reads as
 * the same continuous space as sign-in and onboarding. Picking a language
 * applies + persists it and advances immediately — no separate Continue button
 * (the whole row is one large, keyboard-operable target, so a click is a
 * deliberate choice; language is changeable later from Settings).
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
  // Which row is mid-apply (its choice is being applied + persisted). Null once
  // idle. On success the gate swaps to the next screen, so this never resets to
  // idle on the happy path.
  const [pending, setPending] = useState<SupportedLocale | null>(null);
  const [failed, setFailed] = useState(false);

  const handlePick = async (loc: SupportedLocale) => {
    if (pending) return;
    setPending(loc);
    setFailed(false);
    try {
      await onPick(loc);
      // Funnel step 5: language chosen (fires only after the choice is applied,
      // so a failed-then-retried pick isn't double counted).
      analytics.track("onboarding_language_selected", { locale: loc });
    } catch {
      // Applying the language failed (a genuinely unexpected in-memory i18n
      // swap failure — the account write is best-effort and doesn't reject).
      // Re-enable the rows so the user can retry. No localized copy is possible
      // yet (no locale), so the retry hint stays language-agnostic.
      setPending(null);
      setFailed(true);
    }
  };

  return (
    <SetupCard
      onSpace
      title="Choose your language"
      subtitle="English · Español · Português"
    >
      <div className="flex flex-col gap-2">
        {SUPPORTED_LOCALES.map((loc) => (
          <OptionCard
            key={loc}
            label={DISPLAY_NAMES[loc]}
            selected={false}
            disabled={pending !== null && pending !== loc}
            trailing={
              pending === loc ? (
                <Loader2 className="size-5 animate-spin text-ink-muted" />
              ) : undefined
            }
            onSelect={() => void handlePick(loc)}
          />
        ))}
      </div>
      {failed && (
        <p className="mt-4 text-xs text-danger" role="alert">
          Something went wrong. Please try again.
        </p>
      )}
    </SetupCard>
  );
}
