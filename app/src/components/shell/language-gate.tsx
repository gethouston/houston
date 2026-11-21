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

export function LanguageGate({ children }: { children: ReactNode }) {
  const { locale, isLoading, setLocale } = useLocalePreference();

  if (isLoading) {
    return (
      <FirstRunScreen>
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

const DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

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
  const [detected] = useState<SupportedLocale | null>(() =>
    normalizeLocale(navigator.language),
  );
  const copyLocale = detected ?? "en";
  const [pending, setPending] = useState<SupportedLocale | null>(null);
  const [failed, setFailed] = useState(false);
  const copy = COPY[copyLocale];

  const handlePick = async (loc: SupportedLocale) => {
    if (pending) return;
    setPending(loc);
    setFailed(false);
    try {
      await onPick(loc);
      analytics.track("onboarding_language_selected", {
        locale: loc,
        detected_locale: detected ?? "none",
      });
    } catch {
      setPending(null);
      setFailed(true);
    }
  };

  return (
    <SetupCard title={copy.title} subtitle="English · Español · Português">
      <div className="flex flex-1 flex-col justify-center">
        <div className="flex flex-col gap-3">
          {SUPPORTED_LOCALES.map((loc) => (
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
