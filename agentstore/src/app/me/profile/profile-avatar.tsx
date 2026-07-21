"use client";

import { StoreApiError } from "@houston/agentstore-client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Spinner,
} from "@houston-ai/core";
import { ImageUp, Trash2 } from "lucide-react";
import * as React from "react";
import { deleteAvatar, uploadAvatar } from "@/lib/store-client";

/** The 2 MiB / png-jpeg-webp limits the gateway enforces, mirrored client-side. */
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export interface ProfileAvatarProps {
  avatarUrl: string | null;
  displayName: string;
  getToken: () => Promise<string | null>;
  /** Whether a profile row exists yet (avatar upload needs one first). */
  enabled: boolean;
  onChange: (avatarUrl: string | null) => void;
}

/** First letter of the display name for the avatar fallback glyph. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * The avatar control: shows the current image, uploads a replacement (validated
 * for size and type before the request), or removes it. Every failure surfaces
 * as a visible message; nothing fails silently.
 */
export function ProfileAvatar({
  avatarUrl,
  displayName,
  getToken,
  enabled,
  onChange,
}: ProfileAvatarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function withToken<T>(run: (token: string) => Promise<T>): Promise<T> {
    const token = await getToken();
    if (!token) throw new Error("Your session expired. Sign in again.");
    return run(token);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is over 2 MB. Choose a smaller one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { avatarUrl: next } = await withToken((t) => uploadAvatar(t, file));
      onChange(next);
    } catch (err) {
      setError(
        err instanceof StoreApiError
          ? err.message
          : "Could not upload that image. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await withToken((t) => deleteAvatar(t));
      onChange(null);
    } catch (err) {
      setError(
        err instanceof StoreApiError
          ? err.message
          : "Could not remove your avatar. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Avatar</span>
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xl">
            {initial(displayName)}
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
              Change
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
                Remove
              </Button>
            )}
          </div>
          {!enabled && (
            <p className="text-xs text-muted-foreground">
              Save your profile first to add an avatar.
            </p>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
