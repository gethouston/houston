import { useState, type ReactNode } from "react";

import { HoustonLogo } from "./experience-card";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/i18n";

/**
 * First-run language picker. Shown before the disclaimer gate so a
 * Spanish- or Portuguese-speaking user reads the disclaimer in their
 * own language instead of being forced to accept an English legal
 * notice and only *then* find the Settings toggle.
 *
 * Skipped once the `locale` engine preference is set — users don't
 * re-pick on every launch. Settings has the same picker for later
 * changes.
 */
export function LanguageGate({ children }: { children: ReactNode }) {
  const { locale, isLoading, setLocale } = useLocalePreference();

  if (isLoading) {
    // Neutral blank matching the rest of the pre-app chrome. A flash of
    // the picker followed by the app would look like a glitch.
    return (
      <div
        aria-hidden
        className="flex h-screen w-screen items-center justify-center bg-background"
      />
    );
  }

  if (locale) return <>{children}</>;

  return <LanguageOverlay onPick={setLocale} />;
}

/**
 * Display names are deliberately in the target language itself — the
 * user doesn't have a language yet, so we can't translate the labels.
 * Showing "Español" to a Spanish speaker is more accessible than
 * showing "Spanish".
 */
const DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

function LanguageOverlay({
  onPick,
}: {
  onPick: (locale: SupportedLocale) => Promise<void>;
}) {
  const [pending, setPending] = useState<SupportedLocale | null>(null);

  const handlePick = async (locale: SupportedLocale) => {
    if (pending) return;
    setPending(locale);
    try {
      await onPick(locale);
    } catch {
      // If the write fails the query stays null and the overlay
      // stays mounted — user can try again. Surfacing a localized
      // error isn't possible (no locale yet), so we stay silent.
      setPending(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-gate-title"
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-background p-6 font-sans text-foreground"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-black/10 bg-background px-8 py-10 shadow-[0_4px_4px_rgba(0,0,0,0.04),0_4px_80px_8px_rgba(0,0,0,0.04),0_0_1px_rgba(0,0,0,0.62)]">
        <HoustonLogo size={56} />

        <div className="text-center">
          <h1
            id="language-gate-title"
            className="text-xl font-semibold text-foreground"
          >
            Language · Idioma
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            English · Español · Português
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          {SUPPORTED_LOCALES.map((loc) => {
            const busy = pending === loc;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => handlePick(loc)}
                disabled={pending !== null}
                className="flex h-11 w-full items-center justify-center rounded-full border border-border/50 bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {busy ? "…" : DISPLAY_NAMES[loc]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
