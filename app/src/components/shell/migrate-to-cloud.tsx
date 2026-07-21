import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import astroJpg from "../../assets/space/astro-960.jpg";
import astroWebp from "../../assets/space/astro-960.webp";
import { osIsTauri } from "../../lib/os-bridge";
import { useMigrateToCloudStore } from "../../stores/migrate-to-cloud";
import { MigrateToCloudPitch } from "./migrate-to-cloud-pitch";

/**
 * The legacy→cloud upgrade offer: an announcement-style modal (astronaut
 * side panel, benefit bullets, single pill CTA) — the final feature of this
 * release line.
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
      {/* Borderless on purpose: any hairline reads as a gap between the
          full-bleed image and the card edge. The shadow alone separates the
          card from the scrim. Split layout: the copy grew past what a top
          hero carries well, so the vertical astronaut takes a side column
          and the text keeps a comfortable measure beside it. */}
      <div className="relative flex w-[820px] max-w-full overflow-hidden rounded-2xl bg-card text-card-foreground shadow-[0_16px_60px_rgba(0,0,0,0.16)]">
        {/* bg-primary underlay: any subpixel sliver the cover-crop leaves at
            the card's rounded edge reads as space-dark, never white. */}
        <div className="relative w-[400px] shrink-0 self-stretch bg-primary">
          <picture className="absolute inset-0 block">
            <source type="image/webp" srcSet={astroWebp} />
            <img
              src={astroJpg}
              alt=""
              aria-hidden="true"
              width={960}
              height={1440}
              decoding="async"
              className="block h-full w-full object-cover"
            />
          </picture>
          {/* Seam blend: a whisper of shadow where the photo meets the card,
              so the edge reads composed instead of cut. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent to-black/20"
          />
        </div>

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

        <div className="flex-1 px-8 pb-8 pt-7 text-left">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">
              {t("migrateToCloud.title")}
            </h2>
            {error && (
              <AlertCircle className="size-4 shrink-0 text-destructive" />
            )}
          </div>
          {statusMessage ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {statusMessage}
            </p>
          ) : (
            <MigrateToCloudPitch />
          )}

          {downloading && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-primary transition-[width] duration-200 ${progress === null ? "animate-pulse" : ""}`}
                style={{ width: `${progress ?? 35}%` }}
              />
            </div>
          )}

          {/* Above the CTA on purpose: the pill button closes the card. */}
          {dismissible && (
            <p className="mt-4 text-xs leading-snug text-muted-foreground">
              {t("migrateToCloud.anytimeNote")}
            </p>
          )}

          <button
            type="button"
            onClick={ready ? () => void relaunch() : () => void install()}
            disabled={downloading}
            className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
          >
            {downloading && <Loader2 className="size-4 animate-spin" />}
            {downloading
              ? t("updateChecker.installingAction")
              : ready
                ? t("updateChecker.relaunchAction")
                : error
                  ? t("updateChecker.retryAction")
                  : t("migrateToCloud.installAction")}
          </button>
        </div>
      </div>
    </div>
  );
}
