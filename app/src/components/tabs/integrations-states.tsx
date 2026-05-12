import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Download, Loader2 } from "lucide-react";
import {
  Empty, EmptyHeader, EmptyTitle, EmptyDescription,
} from "@houston-ai/core";
import { HoustonLogo } from "../shell/experience-card";

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
        <EmptyDescription>
          {t("loading.body")}
        </EmptyDescription>
      </EmptyHeader>
      <div className="w-48 h-[2px] rounded-full bg-black/10 overflow-hidden">
        <div
          ref={barRef}
          className="h-full bg-foreground rounded-full"
          style={{ width: "0%", transition: "width 5s linear" }}
        />
      </div>
    </Empty>
  );
}

/**
 * Composio CLI is not installed yet. Ask the user to install it.
 * The install step is a one-time ~80 MB download from Composio's
 * official installer, Houston shells out to it under the hood.
 */
export function NotInstalledState({
  onInstall,
  installing,
}: {
  onInstall: () => void;
  installing: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{t("notInstalled.title")}</EmptyTitle>
        <EmptyDescription>
          {t("notInstalled.body")}
        </EmptyDescription>
      </EmptyHeader>
      <button
        onClick={onInstall}
        disabled={installing}
        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200 disabled:opacity-60"
      >
        {installing ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            {t("notInstalled.installing")}
          </>
        ) : (
          <>
            <Download className="size-3" />
            {t("notInstalled.install")}
          </>
        )}
      </button>
    </Empty>
  );
}

export function NeedsAuthState({ onAuth }: { onAuth: () => void }) {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{t("needsAuth.title")}</EmptyTitle>
        <EmptyDescription>
          {t("needsAuth.body")}
        </EmptyDescription>
      </EmptyHeader>
      <button
        onClick={onAuth}
        className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200"
      >
        {t("needsAuth.signIn")}
      </button>
    </Empty>
  );
}

export function ErrorState({
  message,
  onRetry,
  onReconnect,
}: {
  message: string;
  onRetry: () => void;
  onReconnect: () => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="space-y-2 text-center max-w-md">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {t("error.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200"
        >
          {t("error.retry")}
        </button>
        <button
          onClick={onReconnect}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary transition-colors duration-200"
        >
          {t("error.openDashboard")}
          <ExternalLink className="size-3" />
        </button>
      </div>
    </div>
  );
}
