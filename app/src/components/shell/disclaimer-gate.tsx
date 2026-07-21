import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLegalAcceptance } from "../../hooks/use-legal-acceptance";
import { useLocalePreference } from "../../hooks/use-locale-preference";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import { FirstRunScreen } from "../onboarding/first-run-screen";
import { SetupCard } from "../onboarding/setup-card";

interface Section {
  heading: string;
  body: string;
}

/**
 * Agreement step. Renders `children` once the user has accepted the current
 * disclaimer version; otherwise it shows the agreement on the shared
 * `SetupCard` as step 2 of the setup flow (the language pick runs before, in the
 * LanguageGate), on the calm grey {@link FirstRunScreen} background so it reads
 * as the same continuous flow. Copy lives in `locales/<lang>/legal.json`.
 */
export function DisclaimerGate({ children }: { children: ReactNode }) {
  const { isAccepted, isLoading, accept } = useLegalAcceptance();
  const { clearLocale } = useLocalePreference();

  if (isLoading) {
    return (
      <FirstRunScreen>
        {/* Transparent hold — the background is already painted, so we don't
            double-paint. Full-size so the layout doesn't jump. */}
        <div aria-hidden className="flex flex-1" />
      </FirstRunScreen>
    );
  }

  if (isAccepted) return <>{children}</>;

  return (
    <FirstRunScreen>
      <AgreementScreen onAccept={accept} onBack={() => void clearLocale()} />
    </FirstRunScreen>
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

  const sections =
    (t("legal:sections", { returnObjects: true }) as Section[]) ?? [];

  const handleAccept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAccept();
      // Funnel step 6: consent accepted (only after the write resolves).
      analytics.track("onboarding_agreement_accepted");
    } catch (err) {
      setError(genericErrorDescription("accept_disclaimer", err));
      setBusy(false);
    }
  }, [busy, onAccept]);

  return (
    <SetupCard
      title={t("legal:title")}
      subtitle={t("legal:intro")}
      onBack={onBack}
      backLabel={t("setup:tutorial.nav.back")}
      onNext={() => void handleAccept()}
      nextLabel={
        busy ? t("legal:buttons.accept_busy") : t("legal:buttons.accept")
      }
      nextLoading={busy}
    >
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ol className="space-y-4">
          {sections.map((section, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: sections is a static translation array — no reordering, no add/remove, no per-item state
            <li key={i} className="flex items-start gap-3">
              <span className="w-4 shrink-0 text-sm font-medium tabular-nums text-ink-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {section.heading}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{section.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-ink-muted">{t("legal:closing")}</p>
        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </SetupCard>
  );
}
