"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Spinner,
} from "@houston-ai/core";
import { ImageUp, Trash2 } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";

/** The 2 MiB / png-jpeg-webp limits the gateway enforces, mirrored here. */
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export interface ProfileAvatarLabels {
  title: string;
  change: string;
  remove: string;
  needsProfile: string;
  badType: string;
  tooLarge: string;
  uploadFailed: string;
  removeFailed: string;
}

export const PROFILE_AVATAR_LABELS: ProfileAvatarLabels = {
  title: "Avatar",
  change: "Change",
  remove: "Remove",
  needsProfile: "Save your profile first to add an avatar.",
  badType: "Choose a PNG, JPEG, or WebP image.",
  tooLarge: "That image is over 2 MB. Choose a smaller one.",
  uploadFailed: "Could not upload that image. Please try again.",
  removeFailed: "Could not remove your avatar. Please try again.",
};

export interface ProfileAvatarProps {
  avatarUrl: string | null;
  displayName: string;
  /** Whether a profile row exists yet (avatar upload needs one first). */
  enabled: boolean;
  onChange: (avatarUrl: string | null) => void;
  uploadAvatar: (file: File) => Promise<{ avatarUrl: string }>;
  deleteAvatar: () => Promise<void>;
  labels?: Partial<ProfileAvatarLabels>;
}

/**
 * The avatar control: current image, validated upload, removal. Every failure
 * surfaces as a visible message; nothing fails silently.
 */
export function ProfileAvatar({
  avatarUrl,
  displayName,
  enabled,
  onChange,
  uploadAvatar,
  deleteAvatar,
  labels: overrides,
}: ProfileAvatarProps) {
  const labels = { ...PROFILE_AVATAR_LABELS, ...overrides };
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError(labels.badType);
    if (file.size > MAX_BYTES) return setError(labels.tooLarge);
    setBusy(true);
    setError(null);
    try {
      const { avatarUrl: next } = await uploadAvatar(file);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await deleteAvatar();
      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.removeFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-sm">{labels.title}</span>
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xl">
            {displayName.trim().charAt(0).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="sr-only"
              onChange={onFile}
              disabled={!enabled || busy}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!enabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Spinner className="size-4" />
              ) : (
                <ImageUp className="size-4" />
              )}
              {labels.change}
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!enabled || busy}
                onClick={onRemove}
              >
                <Trash2 className="size-4" />
                {labels.remove}
              </Button>
            )}
          </div>
          {!enabled && (
            <p className="text-ink-muted text-xs">{labels.needsProfile}</p>
          )}
        </div>
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
