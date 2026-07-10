import { Button } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { USER_PROFILES_KEY } from "../../../hooks/queries/use-user-profiles";
import { useMyProfile } from "../../../hooks/use-my-profile";
import { useSession } from "../../../hooks/use-session";
import { signOut } from "../../../lib/auth";
import { showErrorToast } from "../../../lib/error-toast";
import {
  AvatarValidationFailure,
  uploadAvatar,
} from "../../../lib/profile-avatar";
import { isAuthConfigured } from "../../../lib/supabase";
import { useUIStore } from "../../../stores/ui";
import { SettingsControlRow } from "../settings-row";

/** Up to two leading letters from the display name, for the no-photo fallback. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function AccountSection() {
  const { t } = useTranslation("settings");
  const { data: session } = useSession();
  const profile = useMyProfile();
  const addToast = useUIStore((s) => s.addToast);
  const qc = useQueryClient();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  // Optimistic override so the row repaints the instant an upload lands, before
  // the my-profile query round-trips; the resolved profile takes over once the
  // invalidated query repaints (and after remount, when `localAvatar` is null).
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  if (!isAuthConfigured() || !session?.user || !profile) return null;

  const user = session.user;
  // Read the SAME resolved identity every other self-face uses: the uploaded
  // `profiles.avatar_url`/name wins over the provider (Google) photo, so the row
  // never reverts to the stale metadata photo after remount.
  const displayName = profile.name;
  const avatar = localAvatar ?? profile.avatarUrl;

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear so re-selecting the same file still fires onChange.
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const url = await uploadAvatar({ userId: user.id, file });
      setLocalAvatar(url);
      // `useMyProfile` reads the caller's own `["user-profiles", id]` entry, so
      // invalidating the whole prefix repaints every self-face with the upload.
      await qc.invalidateQueries({ queryKey: [USER_PROFILES_KEY] });
      addToast({
        title: t("account.avatar.toasts.successTitle"),
        variant: "success",
      });
    } catch (err) {
      if (err instanceof AvatarValidationFailure) {
        addToast({
          title: t("account.avatar.toasts.errorTitle"),
          description:
            err.reason === "too-large"
              ? t("account.avatar.errors.tooLarge")
              : t("account.avatar.errors.notImage"),
          variant: "error",
        });
      } else {
        // Surface the REAL storage reason (e.g. the migration isn't applied yet)
        // verbatim, and still report to Sentry — honest, not a generic mask.
        const reason = err instanceof Error ? err.message : String(err);
        showErrorToast("upload_avatar", reason, err, {
          userMessage: t("account.avatar.errors.uploadFailed", { reason }),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsControlRow
      leading={
        avatar ? (
          <img
            src={avatar}
            alt=""
            className="size-6 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
            {initialsOf(displayName)}
          </span>
        )
      }
      title={displayName}
      description={user.email ?? undefined}
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          data-busy={busy}
          className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary/60 focus-within:ring-[3px] focus-within:ring-ring/50 data-[busy=true]:pointer-events-none data-[busy=true]:opacity-50"
        >
          {busy
            ? t("account.avatar.changing")
            : t("account.avatar.changeButton")}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => void handleFile(e)}
          />
        </label>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          {t("account.signOut")}
        </Button>
      </div>
    </SettingsControlRow>
  );
}

export function useAccountAvailable() {
  const { data: session } = useSession();
  return isAuthConfigured() && !!session?.user;
}
