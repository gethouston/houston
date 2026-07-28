import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Spinner,
} from "@houston-ai/core";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useMyEditableProfile,
  useSetMyProfile,
} from "../../../hooks/queries/use-my-editable-profile";
import {
  type AvatarImageError,
  AvatarImageFailure,
  fileToAvatarDataUrl,
  isAvatarImageFile,
} from "../../../lib/avatar-image";
import { genericErrorDescription } from "../../../lib/error-report";
import { useUIStore } from "../../../stores/ui";
import { SettingsControlRow } from "../settings-row";

/**
 * One localized string per client-side rejection. Kept as a literal map (not a
 * template key) so a missing translation fails at compile time, and so the user
 * always reads the REAL reason their picture bounced rather than a generic
 * apology.
 */
const PHOTO_ERROR_KEY = {
  notImage: "profile.errors.notImage",
  unreadable: "profile.errors.unreadable",
  tooLarge: "profile.errors.tooLarge",
} as const satisfies Record<AvatarImageError["kind"], string>;

/**
 * Up to two leading letters of the effective display name, uppercased — the
 * face shown when neither the user nor their Google account gave us a picture.
 */
function pictureInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

/**
 * Settings > Profile > Picture: the preview, an always-visible "Change picture"
 * button driving a hidden file input, and — only when the current picture is the
 * user's OWN upload — a "Remove picture" button that clears back to their Google
 * photo. The image is squared and shrunk in the browser before it ever reaches
 * the gateway ({@link fileToAvatarDataUrl}); every client-side rejection toasts
 * its honest reason, and the SAVE itself surfaces through `call()` in
 * `lib/tauri.ts`, so nothing here adds a second failure toast.
 *
 * `displayName` is the EFFECTIVE name the section already resolved (the gateway
 * value, else the identity session's), passed in rather than re-derived so the
 * initials here can never disagree with the name in the field below them.
 */
export function ProfilePhotoRow({ displayName }: { displayName: string }) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const { data: profile } = useMyEditableProfile();
  const setProfile = useSetMyProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  const busy = preparing || setProfile.isPending;

  const failPhoto = (description: string) =>
    addToast({
      title: t("profile.toasts.photoFailed"),
      description,
      variant: "error",
    });

  const handlePick = async (file: File) => {
    if (!isAvatarImageFile(file)) {
      failPhoto(t(PHOTO_ERROR_KEY.notImage));
      return;
    }
    setPreparing(true);
    try {
      const photoUrl = await fileToAvatarDataUrl(file);
      setProfile.mutate(
        { photoUrl },
        { onSuccess: () => addToast({ title: t("profile.toasts.saved") }) },
      );
    } catch (err) {
      failPhoto(
        err instanceof AvatarImageFailure
          ? t(PHOTO_ERROR_KEY[err.reason.kind])
          : genericErrorDescription("profile_photo_prepare", err),
      );
    } finally {
      setPreparing(false);
    }
  };

  const handleRemove = () =>
    setProfile.mutate(
      { photoUrl: null },
      {
        onSuccess: () => addToast({ title: t("profile.toasts.photoRemoved") }),
      },
    );

  if (!profile) return null;

  return (
    <SettingsControlRow
      leading={
        <Avatar size="lg" data-testid="profile-avatar">
          {profile.photoUrl && (
            <AvatarImage
              src={profile.photoUrl}
              alt=""
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          )}
          <AvatarFallback className="font-medium">
            {pictureInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      }
      title={t("profile.photo.label")}
      description={t("profile.photo.hint")}
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          data-testid="profile-photo-change"
          onClick={() => inputRef.current?.click()}
        >
          {busy && <Spinner />}
          {busy ? t("profile.photo.changing") : t("profile.photo.change")}
        </Button>
        {profile.custom.photoUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            data-testid="profile-photo-remove"
            onClick={handleRemove}
          >
            {t("profile.photo.remove")}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="profile-photo-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear it first so re-picking the SAME file still fires a change.
            event.target.value = "";
            if (file) void handlePick(file);
          }}
        />
      </div>
    </SettingsControlRow>
  );
}
