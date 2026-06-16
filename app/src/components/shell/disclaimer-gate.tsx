import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { useLegalAcceptance } from "../../hooks/use-legal-acceptance";
import { SetupCard } from "../onboarding/setup-card";

interface Section {
  heading: string;
  body: string;
}

/**
 * First-run gate. Renders `children` once the user has accepted the current
 * disclaimer version; otherwise it shows the Agreement on the shared
 * `SetupCard` so it reads as part of the same setup flow (the macOS-style
 * Welcome + language pick run before this, in the LanguageGate). Copy lives in
 * `locales/<lang>/legal.json` and `setup.json`.
 */
export function DisclaimerGate({ children }: { children: ReactNode }) {
  const { isAccepted, isLoading, accept, decline } = useLegalAcceptance();

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="flex h-screen w-screen items-center justify-center bg-secondary/60"
      />
    );
  }

  if (isAccepted) return <>{children}</>;

  return <AgreementScreen onAccept={accept} onDecline={decline} />;
}

function AgreementScreen({
  onAccept,
  onDecline,
}: {
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const { t } = useTranslation("legal");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sections = (t("sections", { returnObjects: true }) as Section[]) ?? [];

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (node.scrollHeight <= node.clientHeight + 1) setHasScrolledToEnd(true);
  }, []);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) {
      setHasScrolledToEnd(true);
    }
  }, []);

  const handleAccept = useCallback(async () => {
    if (!hasScrolledToEnd || busy) return;
    setBusy("accept");
    setError(null);
    try {
      await onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }, [busy, hasScrolledToEnd, onAccept]);

  const handleDecline = useCallback(async () => {
    if (busy) return;
    setBusy("decline");
    setError(null);
    try {
      await onDecline();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }, [busy, onDecline]);

  return (
    <SetupCard
      eyebrow={t("legal:kicker")}
      title={t("legal:title")}
      subtitle={t("legal:intro")}
      onNext={() => void handleAccept()}
      nextLabel={
        busy === "accept" ? t("legal:buttons.accept_busy") : t("legal:buttons.accept")
      }
      nextDisabled={!hasScrolledToEnd}
      nextLoading={busy === "accept"}
      helper={
        hasScrolledToEnd ? t("legal:scroll_hint.done") : t("legal:scroll_hint.pending")
      }
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="disclaimer-scroll"
        className="max-h-[44vh] overflow-y-auto pr-1"
      >
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
        <button
          type="button"
          onClick={() => void handleDecline()}
          disabled={busy !== null}
          className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          {busy === "decline"
            ? t("legal:buttons.decline_busy")
            : t("legal:buttons.decline")}
        </button>
        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </SetupCard>
  );
}
