import { Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { analytics } from "../../lib/analytics";
import {
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../lib/i18n";
import { FirstRunScreen } from "../onboarding/first-run-screen";
import { SetupCard } from "../onboarding/setup-card";

/**
 * First-run language flow, styled like the rest of setup. A single beat: a
 * clean centered white card on the calm grey {@link FirstRunScreen} background,
 * the languages offered as plain buttons (one per language, named in its own
 * language). No language is pre-selected — every button is the same neutral
 * grey, so no option is nudged over the others; each applies + persists its
 * language and advances immediately on click. The OS locale is still detected,
 * but only to choose the language the screen's own copy renders in. Language is
 * changeable later from Settings.
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
      <FirstRunScreen>
        {/* Transparent hold — the background is already painted, so we don't
            double-paint. Full-size so the layout doesn't jump when it resolves. */}
        <div aria-hidden className="flex flex-1" />
      </FirstRunScreen>
    );
  }

  if (locale) return <>{children}</>;

  return (
    <FirstRunScreen>
      <LanguagePicker onPick={setLocale} />
    </FirstRunScreen>
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
const COPY: Record<SupportedLocale, { title: string; error: string }> = {
  en: {
    title: "Choose your language",
    error: "Something went wrong. Please try again.",
  },
  es: {
    title: "Elige tu idioma",
    error: "Algo salió mal. Inténtalo de nuevo.",
  },
  pt: {
    title: "Escolha seu idioma",
    error: "Algo deu errado. Tente novamente.",
  },
};

function LanguagePicker({
  onPick,
}: {
  onPick: (locale: SupportedLocale) => Promise<void>;
}) {
  // The OS-detected locale drives ONLY the language this screen's own copy
  // renders in (title, error). No button is pre-selected off it — every
  // language is offered as an identical neutral choice.
  const [detected] = useState<SupportedLocale | null>(() =>
    normalizeLocale(navigator.language),
  );
  const copyLocale = detected ?? "en";
  // Which row is mid-apply (its choice is being applied + persisted). Null once
  // idle. On success the gate swaps to the next screen, so this never resets to
  // idle on the happy path.
  const [pending, setPending] = useState<SupportedLocale | null>(null);
  const [failed, setFailed] = useState(false);
  const copy = COPY[copyLocale];

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
    <SetupCard title={copy.title} subtitle="English · Español · Português">
      <div className="flex flex-1 flex-col justify-center">
        <div className="flex flex-col gap-3">
          {SUPPORTED_LOCALES.map((loc) => (
            // Each language is a plain, generous button that applies + advances
            // on click. All identical neutral grey — no language is nudged over
            // the others, and every option is fully visible without hovering.
            <Button
              key={loc}
              type="button"
              size="lg"
              variant="secondary"
              className="w-full justify-center rounded-full text-base"
              disabled={pending !== null && pending !== loc}
              onClick={() => void handlePick(loc)}
            >
              {pending === loc && <Loader2 className="size-5 animate-spin" />}
              {DISPLAY_NAMES[loc]}
            </Button>
          ))}
        </div>
        {failed && (
          <p className="mt-4 text-xs text-danger" role="alert">
            {copy.error}
          </p>
        )}
      </div>
    </SetupCard>
  );
}
