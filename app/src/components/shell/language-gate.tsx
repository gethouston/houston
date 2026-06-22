import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@houston-ai/core";

import { HoustonLogo } from "./experience-card";
import { analytics } from "../../lib/analytics";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../../lib/i18n";
import { SetupCard, OptionCard } from "../onboarding/setup-card";

/**
 * First-run language flow, styled like the rest of setup. Two beats:
 *   1. A macOS-style "Welcome to Houston" hero that rotates through en/es/pt —
 *      a warm, language-agnostic hello before we ask anything.
 *   2. The language picker (pick, then Continue, so a misclick is recoverable).
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
  { title: "Welcome to Houston!", cta: "Continue" },
  { title: "¡Bienvenido a Houston!", cta: "Continuar" },
  { title: "Boas-vindas ao Houston!", cta: "Continuar" },
];

// Survives a remount within the session: if the user goes back to the picker
// from the agreement (which clears the locale), don't replay the hello — drop
// them straight on the picker.
let welcomeSeen = false;

function LanguageIntro({
  onPick,
}: {
  onPick: (locale: SupportedLocale) => Promise<void>;
}) {
  const [stage, setStage] = useState<"welcome" | "pick">(
    welcomeSeen ? "pick" : "welcome",
  );
  const [selected, setSelected] = useState<SupportedLocale | null>(null);
  const [pending, setPending] = useState(false);

  if (stage === "welcome") {
    return (
      <RotatingWelcome
        onContinue={() => {
          // Funnel step 4: the user cleared the welcome hero. Pure
          // acknowledgement screen, so the click is the event.
          analytics.track("onboarding_welcome_continued");
          welcomeSeen = true;
          setStage("pick");
        }}
      />
    );
  }

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
      title="Choose your language"
      subtitle="English · Español · Português"
      onBack={() => setStage("welcome")}
      backLabel="Back"
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

function RotatingWelcome({ onContinue }: { onContinue: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setI((prev) => (prev + 1) % GREETINGS.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, []);
  const greeting = GREETINGS[i];

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-secondary/60 px-6 text-foreground">
      <div className="relative z-10 flex flex-col items-center gap-12 text-center">
        <HoustonLogo size={72} />
        {/* Fixed height so greetings of different lengths don't shift the logo
            or button; the word itself blurs + scales in each rotation. */}
        <div className="flex min-h-[150px] max-w-2xl items-center justify-center">
          <h1
            key={greeting.title}
            className="welcome-greeting-in bg-gradient-to-b from-foreground to-foreground/55 bg-clip-text text-[44px] font-semibold leading-[1.1] tracking-tight text-transparent"
          >
            {greeting.title}
          </h1>
        </div>
        <Button className="h-11 rounded-full px-6" onClick={onContinue}>
          {greeting.cta}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
