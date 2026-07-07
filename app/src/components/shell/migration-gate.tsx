import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@houston-ai/core";

import { analytics } from "../../lib/analytics";
import { useUpdateChecker } from "../../hooks/use-update-checker";
import { SetupCard } from "../onboarding/setup-card";

/** How long the launch may sit on the "checking" screen before we fail open. */
const CHECK_TIMEOUT_MS = 10_000;

/**
 * The one-way door to the cloud build. This build (the final legacy release)
 * points the Tauri updater at the CLOUD channel manifest; when that manifest
 * offers a version, this gate takes over the screen with the migration story
 * and drives the standard download + install + relaunch flow. "Not now" is
 * session-only: it renders the app and stays out of the way until the next
 * launch. Every failure path falls open into the current app — the gate must
 * never brick a launch. Copy lives in `locales/<lang>/shell.json#migration`.
 */
export function MigrationGate({ children }: { children: ReactNode }) {
  // The updater plugin only resolves in packaged builds; dev skips the gate
  // entirely (the app's usual `import.meta.env.PROD` gating convention).
  if (!import.meta.env.PROD) return <>{children}</>;
  return <MigrationGateInner>{children}</MigrationGateInner>;
}

function MigrationGateInner({ children }: { children: ReactNode }) {
  const { t } = useTranslation("shell");
  const { status, checkNow, installAndRelaunch, relaunchInstalledApp } =
    useUpdateChecker();
  // Session-only postponement (nothing persisted): once the user waves the
  // migration away, the gate never re-takes the screen this session, even
  // though the hook's 30-min re-check keeps running underneath.
  const [postponed, setPostponed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const shownTracked = useRef(false);
  const failedTracked = useRef(false);

  const info = "info" in status ? status.info : null;

  // Bound the spinner: a check that hangs (offline DNS stall, proxy) must not
  // hold the whole app hostage — after ~10s we treat it as a failed check.
  const checkingVisible =
    (status.state === "checking" || retrying) && !timedOut;
  useEffect(() => {
    if (!checkingVisible) return;
    const timer = setTimeout(() => setTimedOut(true), CHECK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [checkingVisible]);

  useEffect(() => {
    if (postponed) return;
    if (status.state === "available" && !shownTracked.current) {
      shownTracked.current = true;
      analytics.track("migration_prompt_shown", {
        from_version: status.info.currentVersion,
        to_version: status.info.version,
      });
    }
  }, [status, postponed]);

  const checkFailed =
    status.state === "check-failed" ||
    (status.state === "checking" && timedOut);
  useEffect(() => {
    if (postponed || retrying || !checkFailed) return;
    if (failedTracked.current) return;
    failedTracked.current = true;
    analytics.track("migration_prompt_check_failed");
  }, [checkFailed, postponed, retrying]);

  const accept = useCallback(() => {
    if (info) {
      analytics.track("migration_prompt_accepted", {
        from_version: info.currentVersion,
        to_version: info.version,
      });
    }
    void installAndRelaunch();
  }, [info, installAndRelaunch]);

  const postpone = useCallback(() => {
    if (info) {
      analytics.track("migration_prompt_postponed", {
        from_version: info.currentVersion,
        to_version: info.version,
      });
    }
    setPostponed(true);
  }, [info]);

  const retry = useCallback(async () => {
    setTimedOut(false);
    setRetrying(true);
    try {
      await checkNow();
    } finally {
      setRetrying(false);
    }
  }, [checkNow]);

  if (postponed) return <>{children}</>;

  // Idle = checked, nothing offered (e.g. the cloud manifest isn't published
  // yet). The app runs exactly as before.
  if (status.state === "idle" && !retrying) return <>{children}</>;

  if (checkingVisible) {
    return (
      <SetupCard title={t("migration.title")} subtitle={t("migration.body")}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          <span role="status">{t("migration.checking")}</span>
        </div>
      </SetupCard>
    );
  }

  if (checkFailed) {
    return (
      <SetupCard
        title={t("migration.checkFailedTitle")}
        subtitle={t("migration.checkFailedBody")}
        onNext={() => void retry()}
        nextLabel={t("migration.tryAgain")}
        helper={
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            onClick={() => setPostponed(true)}
          >
            {t("migration.continueCurrent")}
          </Button>
        }
      />
    );
  }

  const downloading = status.state === "downloading";
  const ready = status.state === "ready";
  const errorPhase = status.state === "error" ? status.phase : null;
  const relaunchOnly = ready || errorPhase === "relaunch";

  const stateLine = (() => {
    if (downloading) {
      return status.progress === null
        ? t("migration.downloading")
        : t("migration.downloadingProgress", { progress: status.progress });
    }
    if (ready) return t("migration.ready");
    if (errorPhase === "install") return t("migration.errorInstall");
    if (errorPhase === "relaunch") return t("migration.errorRelaunch");
    return null;
  })();

  return (
    <SetupCard
      title={t("migration.title")}
      subtitle={t("migration.body")}
      onNext={relaunchOnly ? () => void relaunchInstalledApp() : accept}
      nextLabel={
        relaunchOnly
          ? t("migration.relaunch")
          : errorPhase === "install"
            ? t("migration.tryAgain")
            : t("migration.updateNow")
      }
      nextLoading={downloading}
      helper={
        !downloading && !ready ? (
          <Button
            type="button"
            variant="ghost"
            className="rounded-full"
            onClick={postpone}
          >
            {t("migration.notNow")}
          </Button>
        ) : undefined
      }
    >
      {stateLine && (
        <p role="status" className="text-sm text-muted-foreground">
          {stateLine}
        </p>
      )}
    </SetupCard>
  );
}
