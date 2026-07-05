import {
  AsyncButton,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { HoustonLogo } from "../shell/experience-card";

/** First load: logo pulse + a slow fill bar (the catalog fetch takes a beat). */
export function LoadingState() {
  const { t } = useTranslation("integrations");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Next frame: flip width to 100% so the transition actually animates.
    const raf = requestAnimationFrame(() => {
      if (barRef.current) barRef.current.style.width = "100%";
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Empty className="border-0">
      <HoustonLogo size={48} className="mb-2 animate-pulse" />
      <EmptyHeader>
        <EmptyTitle>{t("loading.title")}</EmptyTitle>
        <EmptyDescription>{t("loading.body")}</EmptyDescription>
      </EmptyHeader>
      <div className="h-[2px] w-48 overflow-hidden rounded-full bg-foreground/10">
        <div
          ref={barRef}
          className="h-full rounded-full bg-foreground"
          style={{ width: "0%", transition: "width 5s linear" }}
        />
      </div>
    </Empty>
  );
}

/** Desktop, signed out of Houston: one sign-in is the only step. */
export function SigninState({
  onSignIn,
  signingIn,
}: {
  onSignIn: () => void;
  signingIn: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{t("signin.title")}</EmptyTitle>
        <EmptyDescription>{t("signin.body")}</EmptyDescription>
      </EmptyHeader>
      <button
        type="button"
        onClick={onSignIn}
        disabled={signingIn}
        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:opacity-60"
      >
        {signingIn && <Loader2 className="size-3 animate-spin" />}
        {t("signin.button")}
      </button>
    </Empty>
  );
}

/** Integrations not configured for this deployment at all. */
export function UnavailableState() {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{t("title")}</EmptyTitle>
        <EmptyDescription>{t("unavailable")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** The one-time "reconnect your apps" security notice, with a dismiss action. */
export function ReconnectBanner({
  onDismiss,
}: {
  onDismiss: () => Promise<void>;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <span className="flex-1">{t("reconnectNotice")}</span>
      <AsyncButton
        variant="ghost"
        size="sm"
        className="shrink-0 rounded-full"
        onClick={() => onDismiss()}
      >
        {t("reconnectDismiss")}
      </AsyncButton>
    </div>
  );
}
