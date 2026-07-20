import { AlertCircle, CloudUpload, Loader2, RotateCw, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
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

  const message = downloading
    ? progress === null
      ? t("updateChecker.downloading")
      : t("updateChecker.downloadingProgress", { progress })
    : ready
      ? t("migrateToCloud.ready")
      : error
        ? t("migrateToCloud.error")
        : t("migrateToCloud.description");

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t("migrateToCloud.cardLabel")}
      aria-live={downloading ? "polite" : "assertive"}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
    >
      <div className="w-[480px] max-w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_16px_60px_rgba(0,0,0,0.16)]">
        {/* Hero: pure CSS gradient (no bundled artwork) with the Houston mark. */}
        <div className="relative flex h-44 items-center justify-center bg-gradient-to-br from-indigo-600 via-violet-500 to-purple-400">
          <img
            src={houstonWhite}
            alt=""
            aria-hidden="true"
            className="size-16 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
          />
          {dismissible && (
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("migrateToCloud.closeLabel")}
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/20 text-white transition-colors hover:bg-black/35"
            >
              <X className="size-4" />
            </button>
          )}
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
          <p className="mx-auto mt-2 max-w-[380px] text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>

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
