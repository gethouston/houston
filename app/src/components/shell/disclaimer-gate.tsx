import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { Button, cn } from "@houston-ai/core";

import { useLegalAcceptance } from "../../hooks/use-legal-acceptance";

interface Section {
  heading: string;
  body: string;
}

/**
 * Full-screen security-disclaimer gate. Renders `children` as-is once
 * the user has accepted the current disclaimer version; otherwise
 * blocks the app with a modal overlay that cannot be dismissed except
 * by clicking Accept (enabled only after the user has scrolled to the
 * end of the text) or Decline (closes the window).
 *
 * Copy lives in `app/src/locales/<lang>/legal.json`.
 */
export function DisclaimerGate({ children }: { children: ReactNode }) {
  const { isAccepted, isLoading, accept, decline } = useLegalAcceptance();

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="flex h-screen w-screen items-center justify-center bg-background"
      />
    );
  }

  if (isAccepted) return <>{children}</>;

  return <DisclaimerOverlay onAccept={accept} onDecline={decline} />;
}

function DisclaimerOverlay({
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
    if (node.scrollHeight <= node.clientHeight + 1) {
      setHasScrolledToEnd(true);
    }
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-gate-title"
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-background p-6 font-sans text-foreground"
    >
      <div className="flex max-h-[min(720px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-background shadow-[0_4px_4px_rgba(0,0,0,0.04),0_4px_80px_8px_rgba(0,0,0,0.04),0_0_1px_rgba(0,0,0,0.62)]">
        <header className="flex flex-col gap-1 border-b border-black/5 px-8 py-6">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("kicker")}
          </p>
          <h1
            id="disclaimer-gate-title"
            className="text-2xl font-semibold text-foreground"
          >
            {t("title")}
          </h1>
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-8 py-6 text-[15px] leading-relaxed text-foreground"
          data-testid="disclaimer-scroll"
        >
          <p className="mb-5 text-foreground">{t("intro")}</p>
          {sections.map((section, i) => (
            <section key={i} className="mb-5 last:mb-0">
              <h2 className="mb-1.5 text-sm font-semibold text-foreground">
                {section.heading}
              </h2>
              <p className="text-muted-foreground">{section.body}</p>
            </section>
          ))}
          <p className="mt-6 text-xs text-muted-foreground">{t("closing")}</p>
        </div>

        <footer className="flex flex-col gap-3 border-t border-black/5 px-8 py-5">
          <p
            className={cn(
              "text-xs",
              hasScrolledToEnd ? "text-muted-foreground" : "text-[#e0ac00]",
            )}
            aria-live="polite"
          >
            {hasScrolledToEnd
              ? t("scroll_hint.done")
              : t("scroll_hint.pending")}
          </p>
          {error ? (
            <p className="text-xs text-[#e02e2a]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleDecline}
              disabled={busy !== null}
              className="rounded-full border-border/50 bg-card text-foreground hover:bg-muted"
            >
              {busy === "decline" ? t("buttons.decline_busy") : t("buttons.decline")}
            </Button>
            <Button
              type="button"
              onClick={handleAccept}
              disabled={!hasScrolledToEnd || busy !== null}
              className="rounded-full bg-gray-950 text-white hover:bg-gray-800"
            >
              {busy === "accept" ? t("buttons.accept_busy") : t("buttons.accept")}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
