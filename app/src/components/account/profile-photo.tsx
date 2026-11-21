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
} from "../../hooks/queries/use-my-editable-profile";
import {
  type AvatarImageError,
  AvatarImageFailure,
  fileToAvatarDataUrl,
  isAvatarImageFile,
} from "../../lib/avatar-image";
import { genericErrorDescription } from "../../lib/error-report";
import { useUIStore } from "../../stores/ui";
import { SettingsControlRow } from "../settings/settings-row";

const PHOTO_ERROR_KEY = {
  notImage: "profile.errors.notImage",
  unreadable: "profile.errors.unreadable",
  tooLarge: "profile.errors.tooLarge",
} as const satisfies Record<AvatarImageError["kind"], string>;

function pictureInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

export function ProfilePhotoRow({ displayName }: { displayName: string }) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const { data: profile } = useMyEditableProfile();
  const setProfile = useSetMyProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  const busy = preparing;
  const photoFailure = {
    title: t("writeFailed.profilePhoto.title"),
    description: t("writeFailed.profilePhoto.description"),
  };

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
      void setProfile(
        { photoUrl },
        { saved: t("profile.toasts.saved"), failure: photoFailure },
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
    void setProfile(
      { photoUrl: null },
      { saved: t("profile.toasts.photoRemoved"), failure: photoFailure },
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
            event.target.value = "";
            if (file) void handlePick(file);
          }}
        />
      </div>
    </SettingsControlRow>
  );
}
