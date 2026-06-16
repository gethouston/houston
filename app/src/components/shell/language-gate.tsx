import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@houston-ai/core";

import { HoustonLogo } from "./experience-card";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/i18n";
import { SetupCard, OptionCard } from "../onboarding/setup-card";

/**
 * First-run language flow, styled like the rest of setup (centered card on the
 * gray backdrop). Two beats:
 *   1. A macOS-style "Welcome to Houston" that rotates through en/es/pt — a
 *      warm, language-agnostic hello before we ask anything.
 *   2. The language picker itself.
 *
 * Shown before the disclaimer so a Spanish/Portuguese speaker reads the
 * agreement in their own language. Skipped once the `locale` engine preference
 * is set; Settings has the same picker for later changes.
 */
export function LanguageGate({ children }: { children: ReactNode }) {
  const { locale, isLoading, setLocale } = useLocalePreference();

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="flex h-screen w-screen items-center justify-center bg-secondary/60"
      />
    );
  }

  if (locale) return <>{children}</>;

  return <LanguageIntro onPick={setLocale} />;
}

// In the target language itself — the user has no locale yet, so "Español"
// reads better to a Spanish speaker than "Spanish".
const DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

// "Welcome to Houston" across the supported languages. Gender-neutral phrasings
// (LatAm-neutral Spanish, Brazilian Portuguese) to match the product voice.
const GREETINGS = [
  { title: "Welcome to Houston", cta: "Continue" },
  { title: "Te damos la bienvenida a Houston", cta: "Continuar" },
  { title: "Boas-vindas ao Houston", cta: "Continuar" },
];

function LanguageIntro({
  onPick,
}: {
  onPick: (locale: SupportedLocale) => Promise<void>;
}) {
  const [stage, setStage] = useState<"welcome" | "pick">("welcome");
  const [pending, setPending] = useState<SupportedLocale | null>(null);

  if (stage === "welcome") {
    return <RotatingWelcome onContinue={() => setStage("pick")} />;
  }

  const handlePick = async (locale: SupportedLocale) => {
    if (pending) return;
    setPending(locale);
    try {
      await onPick(locale);
    } catch {
      // Write failed — stay on the picker so the user can retry. No localized
      // error is possible yet (no locale).
      setPending(null);
    }
  };

  return (
    <SetupCard
      title="Choose your language"
      subtitle="English · Español · Português"
      onBack={() => setStage("welcome")}
      backLabel="Back"
    >
      <div className="flex flex-col gap-2">
        {SUPPORTED_LOCALES.map((loc) => (
          <OptionCard
            key={loc}
            label={DISPLAY_NAMES[loc]}
            selected={pending === loc}
            onSelect={() => void handlePick(loc)}
            disabled={pending !== null && pending !== loc}
          />
        ))}
      </div>
    </SetupCard>
  );
}

function RotatingWelcome({ onContinue }: { onContinue: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setI((prev) => (prev + 1) % GREETINGS.length),
      2200,
    );
    return () => window.clearInterval(id);
  }, []);
  const greeting = GREETINGS[i];

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-secondary/60 px-6 text-foreground">
      <div className="flex min-h-[560px] w-full max-w-2xl flex-col items-center justify-center gap-8 rounded-2xl border border-black/10 bg-background p-8 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
        <HoustonLogo size={52} />
        {/* Keyed by the greeting so only the word cross-fades each rotation,
            while the logo + button stay put — the macOS "hello" feel. */}
        <h1
          key={greeting.title}
          className="setup-step-in text-center text-[28px] font-semibold leading-tight"
        >
          {greeting.title}
        </h1>
        <Button className="rounded-full" onClick={onContinue}>
          {greeting.cta}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
