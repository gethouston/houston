import { AlertCircle, CloudUpload, Loader2, RotateCw, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import houstonBlack from "../../assets/houston-black.svg";
import houstonWhite from "../../assets/houston-icon-white.svg";
import { osIsTauri } from "../../lib/os-bridge";
import { useMigrateToCloudStore } from "../../stores/migrate-to-cloud";

/**
 * The legacy→cloud upgrade offer: an announcement-style modal (hero header,
 * centered copy, single pill CTA) — the final feature of this release line.
 * It greets every packaged launch; the X only hides it for the session, and
 * the sidebar's "Migrate to cloud" entry reopens it, which the copy itself
 * points at so nobody feels rushed. A remote policy of "required" removes
 * the X and it becomes a hard gate.
 *
 * The actual install is `install_cloud_migration` (Rust): a cross-channel,
 * signature-verified updater run against the cloud manifest, after which the
 * relaunch boots the CLOUD build — whose first-run migration wizard imports
 * `~/.houston` data and walks through reconnecting integrations. This
 * component only has to get that build installed.
 */
export function MigrateToCloudOffer() {
  const { t } = useTranslation("shell");
  const {
    visible,
    policy,
    status,
    progress,
    initialize,
    dismiss,
    install,
    relaunch,
  } = useMigrateToCloudStore();

  // Tauri only: the browser dev shell has no updater to run.
  const eligible = osIsTauri();

  useEffect(() => {
    if (eligible) void initialize();
  }, [eligible, initialize]);

  if (!eligible || !visible) return null;

  const downloading = status === "downloading";
  const ready = status === "ready";
  const error = status === "error";
  const dismissible = policy !== "required" && !downloading && !ready;

  // Idle shows the three-paragraph pitch; any active state collapses to a
  // single status line in its place.
  const statusMessage = downloading
    ? progress === null
      ? t("updateChecker.downloading")
      : t("updateChecker.downloadingProgress", { progress })
    : ready
      ? t("migrateToCloud.ready")
      : error
        ? t("migrateToCloud.error")
        : null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("migrateToCloud.cardLabel")}
      aria-live={downloading ? "polite" : "assertive"}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
    >
      <div className="relative w-[480px] max-w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_16px_60px_rgba(0,0,0,0.16)]">
        {dismissible && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("migrateToCloud.closeLabel")}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
        {/* Theme-aware Houston mark on the plain card surface — no band. */}
        <div className="flex items-center justify-center pt-10">
          <img
            src={houstonBlack}
            alt=""
            aria-hidden="true"
            className="houston-update-logo-light size-14 object-contain"
          />
          <img
            src={houstonWhite}
            alt=""
            aria-hidden="true"
            className="houston-update-logo-dark hidden size-14 object-contain"
          />
        </div>

        <div className="p-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-lg font-semibold leading-tight">
              {t("migrateToCloud.title")}
            </h2>
            {error && (
              <AlertCircle className="size-4 shrink-0 text-destructive" />
            )}
          </div>
          {statusMessage ? (
            <p className="mx-auto mt-2 max-w-[380px] text-sm leading-relaxed text-muted-foreground">
              {statusMessage}
            </p>
          ) : (
            <div className="mx-auto mt-3 max-w-[380px] space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>{t("migrateToCloud.intro")}</p>
              <p>{t("migrateToCloud.beta")}</p>
              <p>{t("migrateToCloud.details")}</p>
            </div>
          )}

          {downloading && (
            <div className="mx-auto mt-4 h-1.5 max-w-[380px] overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-primary transition-[width] duration-200 ${progress === null ? "animate-pulse" : ""}`}
                style={{ width: `${progress ?? 35}%` }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={ready ? () => void relaunch() : () => void install()}
            disabled={downloading}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : ready ? (
              <RotateCw className="size-4" />
            ) : (
              <CloudUpload className="size-4" />
            )}
            {downloading
              ? t("updateChecker.installingAction")
              : ready
                ? t("updateChecker.relaunchAction")
                : error
                  ? t("updateChecker.retryAction")
                  : t("migrateToCloud.installAction")}
          </button>

          {dismissible && (
            <p className="mx-auto mt-4 max-w-[380px] text-xs leading-snug text-muted-foreground">
              {t("migrateToCloud.anytimeNote")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
