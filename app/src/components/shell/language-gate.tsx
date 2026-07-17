import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { analytics } from "../../lib/analytics";
import {
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../lib/i18n";
import { OptionCard, SetupCard } from "../onboarding/setup-card";
import { SpaceScreen } from "../space/space-screen";

/**
 * First-run language flow, styled like the rest of setup. A single beat: the
 * language picker, floated on the shared `SpaceScreen` space backdrop so it reads as
 * the same continuous space as sign-in and onboarding. The OS locale is
 * detected and PRESELECTED, so the common case is one click on Continue (or on
 * the already-marked row); picking any row applies + persists it and advances
 * immediately. Language is changeable later from Settings.
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
            we don't double-paint a dim overlay on the space backdrop. Full-size so
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

// No locale preference exists yet, so this screen deliberately does NOT go
// through t() (see the i18n KB: the gate predates the choice). Instead the
// few strings render in the OS-DETECTED language — the honest counterpart of
// preselecting it — with English as the fallback.
const COPY: Record<
  SupportedLocale,
  { title: string; continueLabel: string; error: string }
> = {
  en: {
    title: "Choose your language",
    continueLabel: "Continue",
    error: "Something went wrong. Please try again.",
  },
  es: {
    title: "Elige tu idioma",
    continueLabel: "Continuar",
    error: "Algo salió mal. Inténtalo de nuevo.",
  },
  pt: {
    title: "Escolha seu idioma",
    continueLabel: "Continuar",
    error: "Algo deu errado. Tente novamente.",
  },
};

function LanguagePicker({
  onPick,
}: {
  onPick: (locale: SupportedLocale) => Promise<void>;
}) {
  // The OS-detected locale arrives preselected; the user either confirms it
  // with Continue (or by clicking its row) or picks another row directly.
  const [detected] = useState<SupportedLocale | null>(() =>
    normalizeLocale(navigator.language),
  );
  const preselected = detected ?? "en";
  // Which row is mid-apply (its choice is being applied + persisted). Null once
  // idle. On success the gate swaps to the next screen, so this never resets to
  // idle on the happy path.
  const [pending, setPending] = useState<SupportedLocale | null>(null);
  const [failed, setFailed] = useState(false);
  const copy = COPY[preselected];

  const handlePick = async (loc: SupportedLocale) => {
    if (pending) return;
    setPending(loc);
    setFailed(false);
    try {
      await onPick(loc);
      // Funnel step 5: language chosen (fires only after the choice is applied,
      // so a failed-then-retried pick isn't double counted).
      analytics.track("onboarding_language_selected", {
        locale: loc,
        detected_locale: detected ?? "none",
      });
    } catch {
      // Applying the language failed (a genuinely unexpected in-memory i18n
      // swap failure — the account write is best-effort and doesn't reject).
      // Re-enable the rows so the user can retry.
      setPending(null);
      setFailed(true);
    }
  };

  return (
    <SetupCard
      onSpace
      title={copy.title}
      subtitle="English · Español · Português"
      onNext={() => void handlePick(preselected)}
      nextLabel={copy.continueLabel}
      nextLoading={pending !== null}
    >
      <div className="flex flex-col gap-3">
        {SUPPORTED_LOCALES.map((loc) => (
          <OptionCard
            key={loc}
            label={DISPLAY_NAMES[loc]}
            size="lg"
            selected={loc === preselected}
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
          {copy.error}
        </p>
      )}
    </SetupCard>
  );
}
