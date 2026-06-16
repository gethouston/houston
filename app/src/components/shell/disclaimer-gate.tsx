import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { analytics } from "../../lib/analytics";
import { useLegalAcceptance } from "../../hooks/use-legal-acceptance";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { setupStepNumber } from "../../lib/setup-steps";
import { SetupCard } from "../onboarding/setup-card";

interface Section {
  heading: string;
  body: string;
}

/**
 * Agreement step. Renders `children` once the user has accepted the current
 * disclaimer version; otherwise it shows the agreement on the shared
 * `SetupCard` as step 2 of the setup flow (the rotating Welcome + language pick
 * run before, in the LanguageGate). Copy lives in `locales/<lang>/legal.json`.
 */
export function DisclaimerGate({ children }: { children: ReactNode }) {
  const { isAccepted, isLoading, accept } = useLegalAcceptance();
  const { clearLocale } = useLocalePreference();

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="flex h-screen w-screen items-center justify-center bg-secondary/60"
      />
    );
  }

  if (isAccepted) return <>{children}</>;

  return (
    <AgreementScreen onAccept={accept} onBack={() => void clearLocale()} />
  );
}

function AgreementScreen({
  onAccept,
  onBack,
}: {
  onAccept: () => Promise<void>;
  /** Back to the language picker (clears the locale so the picker re-shows). */
  onBack: () => void;
}) {
  const { t } = useTranslation(["legal", "setup"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = (t("legal:sections", { returnObjects: true }) as Section[]) ?? [];
  const { current, total } = setupStepNumber("agreement");

  const handleAccept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAccept();
      // Funnel step 6: consent accepted (only after the write resolves).
      analytics.track("onboarding_agreement_accepted");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [busy, onAccept]);

  return (
    <SetupCard
      eyebrow={t("setup:tutorial.counter", { current, total })}
      title={t("legal:title")}
      subtitle={t("legal:intro")}
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={() => void handleAccept()}
      nextLabel={busy ? t("legal:buttons.accept_busy") : t("legal:buttons.accept")}
      nextLoading={busy}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ol className="space-y-4">
          {sections.map((section, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-4 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {section.heading}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {section.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">{t("legal:closing")}</p>
        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </SetupCard>
  );
}
