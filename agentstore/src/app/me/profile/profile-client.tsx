"use client";

import {
  type CreatorProfile,
  type CreatorProfilePatch,
  StoreApiError,
} from "@houston/agentstore-client";
import { normalizeHandle } from "@houston/agentstore-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Spinner,
} from "@houston-ai/core";
import { AlertTriangle, LogIn } from "lucide-react";
import * as React from "react";
import { useSession } from "@/lib/auth/session";
import { getMyProfile, patchMyProfile } from "@/lib/store-client";
import { type Form, ProfileForm } from "./profile-form";

/** Reader-facing copy keyed by the gateway's PATCH /me/profile error code. */
const SAVE_ERROR: Record<string, string> = {
  invalid_handle:
    "That handle is not valid. Use 2 to 30 lowercase letters, numbers, or underscores.",
  handle_reserved: "That handle is reserved. Please choose another.",
  handle_taken: "That handle is already taken.",
  handle_change_too_soon: "You can only change your handle once every 30 days.",
  bio_too_long: "Please shorten your bio to under 500 characters.",
  invalid_link: "One of your links is not a valid https:// URL.",
  display_name_required: "Please enter a display name.",
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: CreatorProfile | null };

function toForm(profile: CreatorProfile | null): Form {
  return {
    handle: profile?.handle ?? "",
    displayName: profile?.displayName ?? "",
    bio: profile?.bio ?? "",
    links: profile?.links ?? {},
  };
}

/** Map a save failure to reader-facing copy without ever swallowing it. */
function saveErrorText(err: unknown): string {
  if (err instanceof StoreApiError) {
    return (
      (err.code && SAVE_ERROR[err.code]) ??
      err.message ??
      "Could not save your profile."
    );
  }
  return "Network error. Please check your connection and try again.";
}

/**
 * The creator-profile editor. Loads the caller's profile (or the "claim your
 * handle" state when they have none), and persists edits through the gateway.
 * Session gating mirrors the owner dashboard; the form itself is `ProfileForm`.
 */
export function ProfileClient() {
  const { status: sessionStatus, signIn, getToken } = useSession();
  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  const [form, setForm] = React.useState<Form>(toForm(null));
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      const profile = await getMyProfile(token);
      setForm(toForm(profile));
      setAvatarUrl(profile?.avatarUrl ?? null);
      setLoad({ status: "ready", profile });
    } catch (err) {
      setLoad({
        status: "error",
        message:
          err instanceof Error ? err.message : "Could not load your profile.",
      });
    }
  }, [getToken]);

  React.useEffect(() => {
    if (sessionStatus === "signed-in") void reload();
  }, [sessionStatus, reload]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      const patch: CreatorProfilePatch = {
        handle: normalizeHandle(form.handle),
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        links: form.links,
      };
      const profile = await patchMyProfile(token, patch);
      setForm(toForm(profile));
      setAvatarUrl(profile.avatarUrl);
      setLoad({ status: "ready", profile });
      setSaved(true);
    } catch (err) {
      setError(saveErrorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (sessionStatus === "unconfigured") {
    return (
      <Alert>
        <AlertTitle>Profiles are unavailable</AlertTitle>
        <AlertDescription>
          This deployment is not configured for accounts.
        </AlertDescription>
      </Alert>
    );
  }

  if (sessionStatus === "loading" || load.status === "loading") {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Spinner /> Loading…
      </div>
    );
  }

  if (sessionStatus === "signed-out") {
    return (
      <div className="flex flex-col items-start gap-5">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Your creator profile
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to claim your handle and set up your public profile.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => {
            void signIn().catch(() => {});
          }}
        >
          <LogIn aria-hidden className="size-4" /> Sign in
        </Button>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>Could not load your profile</AlertTitle>
        <AlertDescription>{load.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <ProfileForm
      form={form}
      onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
      claiming={load.profile === null}
      saving={saving}
      saved={saved}
      error={error}
      avatarUrl={avatarUrl}
      onAvatarChange={setAvatarUrl}
      getToken={getToken}
      currentHandle={load.profile?.handle ?? null}
      onSubmit={save}
    />
  );
}
