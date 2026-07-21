import { Button, Spinner } from "@houston-ai/core";
import { User } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../../lib/engine";
import { reportError } from "../../../lib/error-toast";
import { cropAvatarToBlob } from "../../../lib/image-crop";
import { useUIStore } from "../../../stores/ui";

/** Image types the gateway accepts for an avatar (`POST /me/avatar`). */
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** The gateway's 2 MiB ceiling, checked against the CROPPED blob we actually
 *  upload (center-square, ≤512px WebP) rather than the source, so a large phone
 *  photo that downscales fine is never wrongly rejected. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * The profile-photo control: pick an image → center-square crop + downscale in
 * the browser ({@link cropAvatarToBlob}) → `POST /me/avatar`; or remove the
 * current one. Both mutations run against their own gateway endpoint (not the
 * profile Save), so `onChanged` re-reads the profile query and the preview
 * updates immediately. Type is guarded before the crop; size is guarded on the
 * cropped blob. Every failure toasts + reports; success confirms with a toast.
 */
export function AvatarUploadField({
  avatarUrl,
  displayName,
  onChanged,
  disabled,
  claiming,
}: {
  avatarUrl: string | null;
  displayName: string;
  onChanged: () => void;
  disabled?: boolean;
  /**
   * True while the profile is still being claimed (no `@handle` saved yet). The
   * gateway rejects `POST /me/avatar` with 409 `no_profile` until a profile row
   * exists, so during claim the controls are disabled and a hint tells the user
   * to save first — matching the website sibling's `enabled={!claiming}` gate.
   */
  claiming?: boolean;
}) {
  const { t } = useTranslation("store");
  const addToast = useUIStore((s) => s.addToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const locked = busy || disabled || claiming;

  const fail = (command: string, message: string, err: unknown) => {
    reportError(command, message, err);
    addToast({ title: t("profile.saveFailed"), variant: "error" });
  };

  const handlePick = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      addToast({ title: t("profile.avatarBadType"), variant: "error" });
      return;
    }
    setBusy(true);
    try {
      const blob = await cropAvatarToBlob(file);
      if (blob.size > MAX_AVATAR_BYTES) {
        addToast({ title: t("profile.avatarTooLarge"), variant: "error" });
        return;
      }
      await getEngine().uploadStoreAvatar(blob);
      onChanged();
      addToast({ title: t("profile.saved"), variant: "success" });
    } catch (err) {
      fail("store_avatar_upload", "uploadStoreAvatar failed", err);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await getEngine().deleteStoreAvatar();
      onChanged();
      addToast({ title: t("profile.saved"), variant: "success" });
    } catch (err) {
      fail("store_avatar_remove", "deleteStoreAvatar failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink">{t("profile.avatarLabel")}</p>
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="size-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-chip-subtle">
            <User className="size-6 text-ink-muted" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked}
            onClick={() => inputRef.current?.click()}
          >
            {busy && <Spinner className="size-4" />}
            {busy ? t("profile.avatarUploading") : t("profile.avatarChange")}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={handleRemove}
              className="text-danger"
            >
              {t("profile.avatarRemove")}
            </Button>
          )}
        </div>
      </div>
      {claiming && (
        <p className="text-xs text-ink-muted">{t("profile.avatarClaimHint")}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_AVATAR_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handlePick(file);
        }}
      />
    </div>
  );
}
