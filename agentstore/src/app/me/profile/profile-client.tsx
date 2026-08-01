"use client";

import type { CreatorProfile } from "@houston/agentstore-client";
import { Alert, AlertDescription, AlertTitle, Spinner } from "@houston-ai/core";
import { ProfileEditorScreen, ProfileEditorSignedOut } from "@houston-ai/store";
import { AlertTriangle } from "lucide-react";
import * as React from "react";
import { useSession } from "@/lib/auth/session";
import {
  checkHandle,
  deleteAvatar,
  getMyProfile,
  patchMyProfile,
  uploadAvatar,
} from "@/lib/store-client";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: CreatorProfile | null };

/** The web profile editor: session + gateway wiring around the SHARED
 *  ProfileEditorScreen (composition and copy live in @houston-ai/store). */
export function ProfileClient() {
  const { status: sessionStatus, signIn, getToken } = useSession();
  const [load, setLoad] = React.useState<Load>({ status: "loading" });

  const withToken = React.useCallback(
    async <T,>(run: (token: string) => Promise<T>): Promise<T> => {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      return run(token);
    },
    [getToken],
  );

  const reload = React.useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const profile = await withToken((t) => getMyProfile(t));
      setLoad({ status: "ready", profile });
    } catch (err) {
      setLoad({
        status: "error",
        message:
          err instanceof Error ? err.message : "Could not load your profile.",
      });
    }
  }, [withToken]);

  React.useEffect(() => {
    if (sessionStatus === "signed-in") void reload();
  }, [sessionStatus, reload]);

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
      <div className="flex items-center gap-3 text-ink-muted">
        <Spinner /> Loading…
      </div>
    );
  }
  if (sessionStatus === "signed-out") {
    return (
      <ProfileEditorSignedOut
        onSignIn={() => {
          void signIn().catch(() => {});
        }}
      />
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

  const profile = load.profile;
  return (
    <ProfileEditorScreen
      initial={
        profile
          ? {
              handle: profile.handle ?? "",
              displayName: profile.displayName,
              bio: profile.bio ?? "",
              links: profile.links,
              avatarUrl: profile.avatarUrl,
            }
          : null
      }
      currentHandle={profile?.handle ?? null}
      onSave={async (patch) => {
        const saved = await withToken((t) => patchMyProfile(t, patch));
        return {
          handle: saved.handle ?? "",
          displayName: saved.displayName,
          bio: saved.bio ?? "",
          links: saved.links,
          avatarUrl: saved.avatarUrl,
        };
      }}
      checkHandle={(handle) => withToken((t) => checkHandle(t, handle))}
      uploadAvatar={(file) => withToken((t) => uploadAvatar(t, file))}
      deleteAvatar={() => withToken((t) => deleteAvatar(t))}
    />
  );
}
